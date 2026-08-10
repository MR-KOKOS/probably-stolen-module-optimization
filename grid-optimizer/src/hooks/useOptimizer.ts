import { useState, useRef, useEffect } from 'react';
import type {GridTier, InventoryItem, Stats, Point} from '../types';
import { getEffectiveBaseStats, applyInternalEffects, PRECOMPUTED_OFFSETS } from '../utils';

export function useOptimizer() {
    const [tier, setTier] = useState<GridTier>(3);

    // Complex Goals
    const [targetStats, setTargetStats] = useState<Stats>({ Performance: 0, Quality: 0, Efficiency: 0 });
    const [maximizeStats, setMaximizeStats] = useState({ Performance: false, Quality: false, Efficiency: false });

    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [board, setBoard] = useState<(InventoryItem | 'Locked' | null)[][]>(() => initializeBoard(3));
    const [bestTotals, setBestTotals] = useState<Stats>({ Performance: 0, Quality: 0, Efficiency: 0 });
    const [bestPieceStats, setBestPieceStats] = useState<Map<string, Stats>>(new Map());

    const [isSolving, setIsSolving] = useState(false);
    const [warningMsg, setWarningMsg] = useState<string | null>(null);
    const isSolvingRef = useRef(false);

    function initializeBoard(currentTier: GridTier) {
        const grid = Array.from({ length: 5 }, () => Array.from({ length: 7 }, () => null as any));
        if (currentTier === 1 || currentTier === 2) {
            grid[0][0] = grid[0][6] = grid[4][0] = grid[4][6] = 'Locked';
        }
        if (currentTier === 1) {
            grid[1][3] = grid[2][2] = grid[2][3] = grid[2][4] = grid[3][3] = 'Locked';
        }
        return grid;
    }

    const handleTierChange = (newTier: GridTier) => {
        setTier(newTier);
        setBoard(initializeBoard(newTier));
        setBestTotals({ Performance: 0, Quality: 0, Efficiency: 0 });
        setBestPieceStats(new Map());
        setWarningMsg(null);
    };

    const resetBoard = () => {
        if (isSolving) {
            isSolvingRef.current = false;
            setIsSolving(false);
        }
        setBoard(initializeBoard(tier));
        setBestTotals({ Performance: 0, Quality: 0, Efficiency: 0 });
        setBestPieceStats(new Map());
        setInventory([]);
        setWarningMsg(null);
        setTargetStats({ Performance: 0, Quality: 0, Efficiency: 0 });
        setMaximizeStats({ Performance: false, Quality: false, Efficiency: false });
    };

    const calculateBoardStats = (currentBoard: (InventoryItem | 'Locked' | null)[][]) => {
        const totals: Stats = { Performance: 0, Quality: 0, Efficiency: 0 };
        const pieceStats = new Map<string, Stats>();
        let coveredNodeSides = 0;
        let negativeContactCount = 0;
        let nodeNodeContactCount = 0;
        let placedPiecesCount = 0;
        let placedAlarmsCount = 0;
        let placedJunkCount = 0;
        let placedBlastCount = 0;

        const offsets = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
        const placedPieces = new Map<string, { item: InventoryItem, minX: number, minY: number }>();
        const nodeAdjacencies = new Map<string, Set<string>>();
        const gridItemMap = new Map<string, InventoryItem>();

        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < 7; x++) {
                const boardCell = currentBoard[y][x];
                if (boardCell && boardCell !== 'Locked') {
                    const cell = inventory.find(i => i.id === boardCell.id) || boardCell;
                    gridItemMap.set(`${x},${y}`, cell);

                    if (!placedPieces.has(cell.id)) {
                        placedPieces.set(cell.id, { item: cell, minX: x, minY: y });
                        placedPiecesCount++;
                    } else {
                        const p = placedPieces.get(cell.id)!;
                        if (x < p.minX) p.minX = x;
                        if (y < p.minY) p.minY = y;
                    }

                    if (cell.color === 'White') {
                        if (!nodeAdjacencies.has(cell.id)) nodeAdjacencies.set(cell.id, new Set());
                        offsets.forEach(off => {
                            const nx = x + off.x; const ny = y + off.y;
                            if (nx >= 0 && nx < 7 && ny >= 0 && ny < 5) {
                                const adjBoardCell = currentBoard[ny][nx];
                                if (adjBoardCell && adjBoardCell !== 'Locked') {
                                    const adj = inventory.find(i => i.id === adjBoardCell.id) || adjBoardCell;
                                    if (adj.color !== 'White') {
                                        nodeAdjacencies.get(cell.id)!.add(adj.id);
                                        coveredNodeSides++;

                                        const adjModified = applyInternalEffects(adj);
                                        const isPureNegative =
                                            (Math.trunc(adjModified.Performance) <= 0 && Math.trunc(adjModified.Quality) <= 0 && Math.trunc(adjModified.Efficiency) <= 0) &&
                                            (Math.trunc(adjModified.Performance) < 0 || Math.trunc(adjModified.Quality) < 0 || Math.trunc(adjModified.Efficiency) < 0);

                                        if (isPureNegative) {
                                            negativeContactCount++;
                                        }
                                    } else if (adj.id !== cell.id) {
                                        nodeNodeContactCount++;
                                    }
                                }
                            }
                        });
                    }
                }
            }
        }

        const internalStats = new Map<string, Stats>();
        placedPieces.forEach(({ item }) => {
            if (item.displayName.includes('Alarm Module')) placedAlarmsCount++;
            if (item.displayName.includes('Junk Processing')) placedJunkCount++;
            if (item.displayName.includes('Blast Module')) placedBlastCount++;

            if (item.color !== 'White') {
                let modified = applyInternalEffects(item);

                const nfCount = item.effects.filter(e => e === 'Negative Feedback').length;
                if (nfCount > 0) {
                    let nfPerf = 0, nfQual = 0, nfEff = 0;
                    const adjacentNeighborIds = new Set<string>();

                    gridItemMap.forEach((cellItem, coordStr) => {
                        if (cellItem.id === item.id) {
                            const [cx, cy] = coordStr.split(',').map(Number);
                            offsets.forEach(off => {
                                const nx = cx + off.x;
                                const ny = cy + off.y;
                                const neighborItem = gridItemMap.get(`${nx},${ny}`);
                                if (neighborItem && neighborItem.id !== item.id && neighborItem.color !== 'White') {
                                    adjacentNeighborIds.add(neighborItem.id);
                                }
                            });
                        }
                    });

                    adjacentNeighborIds.forEach(neighborId => {
                        const neighborItem = Array.from(gridItemMap.values()).find(i => i.id === neighborId);
                        if (neighborItem) {
                            const neighborBase = getEffectiveBaseStats(neighborItem);
                            if (neighborBase.Performance < 0) nfPerf += neighborBase.Performance;
                            if (neighborBase.Quality < 0) nfQual += neighborBase.Quality;
                            if (neighborBase.Efficiency < 0) nfEff += neighborBase.Efficiency;
                        }
                    });

                    modified.Performance += (nfCount * 0.25 * nfPerf);
                    modified.Quality += (nfCount * 0.25 * nfQual);
                    modified.Efficiency += (nfCount * 0.25 * nfEff);
                }

                modified.Performance = Math.trunc(modified.Performance);
                modified.Quality = Math.trunc(modified.Quality);
                modified.Efficiency = Math.trunc(modified.Efficiency);

                internalStats.set(item.id, modified);
            }
        });

        placedPieces.forEach(({ item, minX, minY }) => {
            if (item.color !== 'White') {
                let { Performance: p, Quality: q, Efficiency: e } = internalStats.get(item.id)!;

                let multiplier = 0;
                if (item.effects.includes('Side Mount') && minX === 0) multiplier += 0.20;
                if (item.effects.includes('Top Mount') && minY === 0) multiplier += 0.20;

                if (item.effects.includes('Receiver')) {
                    let adjNodes = 0;
                    nodeAdjacencies.forEach((adjSet) => { if (adjSet.has(item.id)) adjNodes++; });
                    multiplier += (0.10 * adjNodes);
                }

                if (multiplier > 0) {
                    p = Math.trunc(p * (1 + multiplier));
                    q = Math.trunc(q * (1 + multiplier));
                    e = Math.trunc(e * (1 + multiplier));
                }

                const finalStats = {
                    Performance: Math.trunc(p),
                    Quality: Math.trunc(q),
                    Efficiency: Math.trunc(e)
                };

                pieceStats.set(item.id, finalStats);
                totals.Performance += finalStats.Performance;
                totals.Quality += finalStats.Quality;
                totals.Efficiency += finalStats.Efficiency;
            }
        });

        nodeAdjacencies.forEach((adjIds, nodeId) => {
            let nodeP = 0, nodeQ = 0, nodeE = 0;

            adjIds.forEach(adjId => {
                const adjacentItemData = placedPieces.get(adjId);
                if (adjacentItemData) {
                    const baseAdj = getEffectiveBaseStats(adjacentItemData.item);
                    nodeP += baseAdj.Performance;
                    nodeQ += baseAdj.Quality;
                    nodeE += baseAdj.Efficiency;
                }
            });

            const nodeStat = {
                Performance: Math.trunc(nodeP * 0.20),
                Quality: Math.trunc(nodeQ * 0.20),
                Efficiency: Math.trunc(nodeE * 0.20)
            };

            pieceStats.set(nodeId, nodeStat);
            totals.Performance += nodeStat.Performance;
            totals.Quality += nodeStat.Quality;
            totals.Efficiency += nodeStat.Efficiency;
        });

        return { totals, pieceStats, coveredNodeSides, negativeContactCount, nodeNodeContactCount, placedPiecesCount, placedAlarmsCount, placedJunkCount, placedBlastCount };
    };

    useEffect(() => {
        if (!isSolvingRef.current) {
            let boardChanged = false;
            const newBoard = board.map(row => row.map(cell => {
                if (cell && cell !== 'Locked') {
                    const invMatch = inventory.find(i => i.id === cell.id);
                    if (invMatch && invMatch !== cell) {
                        boardChanged = true;
                        return invMatch;
                    }
                }
                return cell;
            }));

            const boardToCalculate = boardChanged ? newBoard : board;
            const { totals, pieceStats } = calculateBoardStats(boardToCalculate);

            setBestTotals(totals);
            setBestPieceStats(new Map(pieceStats));
            if (boardChanged) setBoard(newBoard);
        }
    }, [inventory]);

    const runOptimization = async () => {
        if (isSolving) {
            isSolvingRef.current = false;
            return;
        }

        if (inventory.length === 0) {
            setWarningMsg(`Cannot optimize: You have no modules selected.`);
            return;
        }

        let activeMax = { ...maximizeStats };
        let activeTar = { ...targetStats };

        const hasAnyPositiveStats = inventory.some(item => {
            const modified = applyInternalEffects(item);
            return Math.trunc(modified.Performance) > 0 || Math.trunc(modified.Quality) > 0 || Math.trunc(modified.Efficiency) > 0;
        });

        if (!hasAnyPositiveStats) {
            setWarningMsg(`Selected modules have no stats. Optimizing for space/packing.`);
        } else {
            const validForCurrentGoals = inventory.some(item => {
                const mod = applyInternalEffects(item);
                return (activeMax.Performance && Math.trunc(mod.Performance) > 0) ||
                    (activeMax.Quality && Math.trunc(mod.Quality) > 0) ||
                    (activeMax.Efficiency && Math.trunc(mod.Efficiency) > 0) ||
                    (activeTar.Performance > 0 && Math.trunc(mod.Performance) > 0) ||
                    (activeTar.Quality > 0 && Math.trunc(mod.Quality) > 0) ||
                    (activeTar.Efficiency > 0 && Math.trunc(mod.Efficiency) > 0);
            });

            if (!validForCurrentGoals) {
                const redCount = inventory.filter(i => Math.trunc(applyInternalEffects(i).Performance) > 0).length;
                const yellowCount = inventory.filter(i => Math.trunc(applyInternalEffects(i).Quality) > 0).length;
                const greenCount = inventory.filter(i => Math.trunc(applyInternalEffects(i).Efficiency) > 0).length;

                let autoGoal: keyof Stats = 'Performance';
                if (redCount >= yellowCount && redCount >= greenCount && redCount > 0) autoGoal = 'Performance';
                else if (yellowCount >= redCount && yellowCount >= greenCount && yellowCount > 0) autoGoal = 'Quality';
                else if (greenCount >= redCount && greenCount >= yellowCount && greenCount > 0) autoGoal = 'Efficiency';

                activeTar = { Performance: 0, Quality: 0, Efficiency: 0 };
                activeMax = { Performance: false, Quality: false, Efficiency: false };
                activeMax[autoGoal] = true;

                setTargetStats(activeTar);
                setMaximizeStats(activeMax);

                const isAnyGoalSetInitially = maximizeStats.Performance || maximizeStats.Quality || maximizeStats.Efficiency || targetStats.Performance > 0 || targetStats.Quality > 0 || targetStats.Efficiency > 0;

                if (!isAnyGoalSetInitially) {
                    setWarningMsg(`No stat selected. Auto-maximizing majority type: ${autoGoal}`);
                } else {
                    setWarningMsg(`Selected modules do not provide targeted stats. Auto-maximizing majority type: ${autoGoal}`);
                }
            } else {
                setWarningMsg(null);
            }
        }

        let weightP = activeMax.Performance ? 1 : 0;
        let weightQ = activeMax.Quality ? 1 : 0;
        let weightE = activeMax.Efficiency ? 1 : 0;
        if (activeTar.Performance > 0) weightP += 10;
        if (activeTar.Quality > 0) weightQ += 10;
        if (activeTar.Efficiency > 0) weightE += 10;

        const isAlarm = (p: InventoryItem) => p.displayName.includes('Alarm Module');
        const isJunk = (p: InventoryItem) => p.displayName.includes('Junk Processing');
        const isBlast = (p: InventoryItem) => p.displayName.includes('Blast Module');

        const targetAlarmCount = inventory.filter(isAlarm).length;
        const targetJunkCount = inventory.some(isJunk) ? 1 : 0;
        const targetBlastCount = inventory.some(isBlast) ? 1 : 0;

        const calculateFitness = (t: Stats, piecesCount: number, alarmsCount: number, junkCount: number, blastCount: number) => {
            let score = 0;

            if (!hasAnyPositiveStats) {
                score = piecesCount;
                if (alarmsCount < targetAlarmCount) score -= (targetAlarmCount - alarmsCount) * 100000;
                if (junkCount < targetJunkCount) score -= 100000;
                if (blastCount < targetBlastCount) score -= 100000;
                return score;
            }

            if (alarmsCount < targetAlarmCount) score -= (targetAlarmCount - alarmsCount) * 100000;
            if (junkCount < targetJunkCount) score -= 100000;
            if (blastCount < targetBlastCount) score -= 100000;

            if (activeTar.Performance > 0 && t.Performance < activeTar.Performance) score -= (activeTar.Performance - t.Performance) * 10000;
            if (activeTar.Quality > 0 && t.Quality < activeTar.Quality) score -= (activeTar.Quality - t.Quality) * 10000;
            if (activeTar.Efficiency > 0 && t.Efficiency < activeTar.Efficiency) score -= (activeTar.Efficiency - t.Efficiency) * 10000;

            if (activeMax.Performance) score += t.Performance;
            if (activeMax.Quality) score += t.Quality;
            if (activeMax.Efficiency) score += t.Efficiency;

            return score;
        };

        setIsSolving(true);
        isSolvingRef.current = true;

        let localBestScore = -Infinity;
        let currentBoardState = initializeBoard(tier);

        let stagnationCounter = 0;
        const STAGNATION_LIMIT = 75;

        const precomputedBase = new Map<string, Stats>();
        const precomputedInternal = new Map<string, Stats>();
        inventory.forEach(item => {
            precomputedBase.set(item.id, getEffectiveBaseStats(item));
            precomputedInternal.set(item.id, applyInternalEffects(item));
        });

        const evaluatePlacementDelta = (piece: InventoryItem, x: number, y: number, offsets: Point[], testBoard: (InventoryItem | 'Locked' | null)[][], isBoardEmpty: boolean) => {
            let isConnected = false;
            let adjNodes = 0;
            let negFeedbackBonus = 0;
            let negativeContactCount = 0;
            let nodeNodeContactCount = 0;

            const base = precomputedBase.get(piece.id)!;
            const internal = precomputedInternal.get(piece.id)!;
            let p = internal.Performance;
            let q = internal.Quality;
            let e = internal.Efficiency;

            const hasSideMount = piece.effects.includes('Side Mount');
            const hasTopMount = piece.effects.includes('Top Mount');
            const hasReceiver = piece.effects.includes('Receiver');
            const nfCount = piece.effects.filter(eff => eff === 'Negative Feedback').length;
            const isPureNegative = p <= 0 && q <= 0 && e <= 0 && (p < 0 || q < 0 || e < 0);

            let multiplier = 0;
            const pieceMinX = x + Math.min(...offsets.map(pt => pt.x));
            const pieceMinY = y + Math.min(...offsets.map(pt => pt.y));

            if (hasSideMount && pieceMinX === 0) multiplier += 0.20;
            if (hasTopMount && pieceMinY === 0) multiplier += 0.20;

            const neighborIds = new Set<string>();

            for (const pt of offsets) {
                const px = x + pt.x;
                const py = y + pt.y;

                if (px < 0 || px >= 7 || py < 0 || py >= 5 || testBoard[py][px] !== null) {
                    return -Infinity;
                }
                if (px === 0 || px === 6 || py === 0 || py === 4) isConnected = true;

                const neighbors = [ {nx: px, ny: py - 1}, {nx: px, ny: py + 1}, {nx: px - 1, ny: py}, {nx: px + 1, ny: py} ];
                for (const {nx, ny} of neighbors) {
                    if (nx >= 0 && nx < 7 && ny >= 0 && ny < 5) {
                        const adjCell = testBoard[ny][nx];
                        if (adjCell && adjCell !== 'Locked') {
                            isConnected = true;
                            neighborIds.add((adjCell as InventoryItem).id);

                            if (piece.color === 'White') {
                                if (adjCell.color !== 'White') {
                                    const adjInt = precomputedInternal.get((adjCell as InventoryItem).id)!;
                                    if (adjInt.Performance <= 0 && adjInt.Quality <= 0 && adjInt.Efficiency <= 0 && (adjInt.Performance < 0 || adjInt.Quality < 0 || adjInt.Efficiency < 0)) {
                                        negativeContactCount++;
                                    }
                                } else {
                                    nodeNodeContactCount++;
                                }
                            } else if (isPureNegative && adjCell.color === 'White') {
                                negativeContactCount++;
                            }
                        }
                    }
                }
            }

            if (!isConnected && !isBoardEmpty) return -10000;

            let nodeBonusScore = 0;

            neighborIds.forEach(adjId => {
                const adjPiece = inventory.find(i => i.id === adjId);
                if (!adjPiece) return;

                if (piece.color !== 'White' && adjPiece.color === 'White') {
                    adjNodes++;
                    nodeBonusScore += Math.trunc(base.Performance * 0.20) * weightP;
                    nodeBonusScore += Math.trunc(base.Quality * 0.20) * weightQ;
                    nodeBonusScore += Math.trunc(base.Efficiency * 0.20) * weightE;
                }

                if (nfCount > 0 && adjPiece.color !== 'White') {
                    const adjBase = precomputedBase.get(adjId)!;
                    if (adjBase.Performance < 0) negFeedbackBonus += Math.trunc(nfCount * 0.25 * adjBase.Performance);
                    if (adjBase.Quality < 0) negFeedbackBonus += Math.trunc(nfCount * 0.25 * adjBase.Quality);
                    if (adjBase.Efficiency < 0) negFeedbackBonus += Math.trunc(nfCount * 0.25 * adjBase.Efficiency);
                }
            });

            if (hasReceiver) multiplier += (0.10 * adjNodes);

            if (multiplier > 0) {
                p = Math.trunc(p * (1 + multiplier));
                q = Math.trunc(q * (1 + multiplier));
                e = Math.trunc(e * (1 + multiplier));
            }

            p += negFeedbackBonus;
            q += negFeedbackBonus;
            e += negFeedbackBonus;

            const statScore = (p * weightP) + (q * weightQ) + (e * weightE) + nodeBonusScore;
            return statScore + (adjNodes * 0.05) - (negativeContactCount * 1000) - (nodeNodeContactCount * 0.1);
        };

        while (isSolvingRef.current) {
            let testBoard = currentBoardState.map(row => [...row]);
            let itemsToPlace: InventoryItem[] = [];
            const mandatoryIds = new Set<string>();

            const isStagnant = stagnationCounter >= STAGNATION_LIMIT;
            const shouldMutate = localBestScore !== -Infinity && (isStagnant || Math.random() > 0.2);

            if (shouldMutate) {
                const placedIds = new Set<string>();
                for (let y = 0; y < 5; y++) {
                    for (let x = 0; x < 7; x++) {
                        const cell = testBoard[y][x];
                        if (cell && cell !== 'Locked') placedIds.add(cell.id);
                    }
                }

                const piecesToMutate: InventoryItem[] = [];
                if (placedIds.size > 0) {
                    const idsArr = Array.from(placedIds).sort(() => Math.random() - 0.5);

                    let removeCount;
                    if (isStagnant) {
                        removeCount = Math.max(1, Math.floor(idsArr.length * (0.5 + Math.random() * 0.4)));
                        stagnationCounter = 0;
                    } else {
                        removeCount = Math.floor(Math.random() * Math.min(3, idsArr.length)) + 1;
                    }

                    for (let i = 0; i < removeCount; i++) {
                        const idToRemove = idsArr[i];
                        for(let y=0; y<5; y++) {
                            for(let x=0; x<7; x++) {
                                const cell = testBoard[y][x];
                                if (cell && cell !== 'Locked' && cell.id === idToRemove) testBoard[y][x] = null;
                            }
                        }
                        const pItem = inventory.find(inv => inv.id === idToRemove);
                        if (pItem) piecesToMutate.push(pItem);
                    }
                }
                const unusedItems = inventory.filter(inv => !placedIds.has(inv.id));
                const rawItemsToPlace = [...piecesToMutate, ...unusedItems];

                let boardHasJunk = false;
                let boardHasBlast = false;
                placedIds.forEach(id => {
                    const p = inventory.find(i => i.id === id);
                    if (p) {
                        if (isJunk(p)) boardHasJunk = true;
                        if (isBlast(p)) boardHasBlast = true;
                    }
                });

                const mutationAlarms = rawItemsToPlace.filter(isAlarm);
                const mutationJunks = rawItemsToPlace.filter(isJunk);
                const mutationBlasts = rawItemsToPlace.filter(isBlast);
                const mutationOthers = rawItemsToPlace.filter(p => !isAlarm(p) && !isJunk(p) && !isBlast(p));

                const mandatoryThisRound: InventoryItem[] = [...mutationAlarms];
                const fillerThisRound: InventoryItem[] = [];

                if (!boardHasJunk && mutationJunks.length > 0) {
                    const shuffledJ = [...mutationJunks].sort(() => Math.random() - 0.5);
                    mandatoryThisRound.push(shuffledJ.shift()!);
                    fillerThisRound.push(...shuffledJ);
                } else {
                    fillerThisRound.push(...mutationJunks);
                }

                if (!boardHasBlast && mutationBlasts.length > 0) {
                    const shuffledB = [...mutationBlasts].sort(() => Math.random() - 0.5);
                    mandatoryThisRound.push(shuffledB.shift()!);
                    fillerThisRound.push(...shuffledB);
                } else {
                    fillerThisRound.push(...mutationBlasts);
                }

                mandatoryThisRound.forEach(p => mandatoryIds.add(p.id));

                itemsToPlace = [
                    ...mandatoryThisRound.sort(() => Math.random() - 0.5),
                    ...mutationOthers.sort(() => Math.random() - 0.5),
                    ...fillerThisRound.sort(() => Math.random() - 0.5)
                ];

            } else {
                testBoard = initializeBoard(tier);

                const alarms = inventory.filter(isAlarm);
                const junks = inventory.filter(isJunk);
                const blasts = inventory.filter(isBlast);
                const others = inventory.filter(p => !isAlarm(p) && !isJunk(p) && !isBlast(p));

                const mandatoryThisRound: InventoryItem[] = [...alarms];
                const fillerThisRound: InventoryItem[] = [];

                if (junks.length > 0) {
                    const shuffledJ = [...junks].sort(() => Math.random() - 0.5);
                    mandatoryThisRound.push(shuffledJ.shift()!);
                    fillerThisRound.push(...shuffledJ);
                }
                if (blasts.length > 0) {
                    const shuffledB = [...blasts].sort(() => Math.random() - 0.5);
                    mandatoryThisRound.push(shuffledB.shift()!);
                    fillerThisRound.push(...shuffledB);
                }

                mandatoryThisRound.forEach(p => mandatoryIds.add(p.id));

                const getEffectiveStat = (item: InventoryItem) => {
                    const modified = applyInternalEffects(item);
                    return (modified.Performance * weightP) + (modified.Quality * weightQ) + (modified.Efficiency * weightE);
                };

                const optionalByShape = new Map<string, InventoryItem[]>();
                others.forEach(item => {
                    if (!optionalByShape.has(item.shape)) optionalByShape.set(item.shape, []);
                    optionalByShape.get(item.shape)!.push(item);
                });

                optionalByShape.forEach(list => list.sort((a, b) => getEffectiveStat(b) - getEffectiveStat(a)));

                const shapeSequence = others.map(i => i.shape).sort(() => Math.random() - 0.5);
                const shuffledOptional = shapeSequence.map(shape => optionalByShape.get(shape)!.shift()!);

                itemsToPlace = [
                    ...mandatoryThisRound.sort(() => Math.random() - 0.5),
                    ...shuffledOptional,
                    ...fillerThisRound.sort(() => Math.random() - 0.5)
                ];
            }

            let isBoardEmpty = true;
            for (let y = 0; y < 5; y++) {
                for (let x = 0; x < 7; x++) {
                    if (testBoard[y][x] && testBoard[y][x] !== 'Locked') { isBoardEmpty = false; break; }
                }
                if (!isBoardEmpty) break;
            }

            for (const piece of itemsToPlace) {
                const isFiller = (isJunk(piece) || isBlast(piece)) && !mandatoryIds.has(piece.id);
                const orientations = PRECOMPUTED_OFFSETS.get(piece.shape) || [];
                const validPlacements: { x: number, y: number, offsets: Point[], score: number, heuristicScore: number }[] = [];

                for (const offsets of orientations) {
                    for (let y = 0; y < 5; y++) {
                        for (let x = 0; x < 7; x++) {
                            const deltaScore = evaluatePlacementDelta(piece, x, y, offsets, testBoard, isBoardEmpty);
                            if (deltaScore !== -Infinity) {
                                // Prevent extra junks/blasts from being placed if they lower the score
                                if (isFiller && deltaScore < 0) continue;
                                validPlacements.push({ x, y, offsets, score: 0, heuristicScore: deltaScore });
                            }
                        }
                    }
                }

                if (validPlacements.length > 0) {
                    validPlacements.sort((a, b) => b.heuristicScore - a.heuristicScore);
                    const topN = Math.min(3, validPlacements.length);
                    const picked = validPlacements[Math.floor(Math.random() * topN)];
                    for (const pt of picked.offsets) {
                        testBoard[picked.y + pt.y][picked.x + pt.x] = piece;
                    }
                    isBoardEmpty = false;
                }
            }

            const { totals, pieceStats, placedPiecesCount, placedAlarmsCount, placedJunkCount, placedBlastCount } = calculateBoardStats(testBoard);
            const currentScore = calculateFitness(totals, placedPiecesCount, placedAlarmsCount, placedJunkCount, placedBlastCount);

            if (!isSolvingRef.current) break;

            if (currentScore > localBestScore) {
                localBestScore = currentScore;
                currentBoardState = testBoard.map(row => [...row]);
                setBestTotals(totals);
                setBestPieceStats(new Map(pieceStats));
                setBoard(testBoard.map(row => [...row]));
                stagnationCounter = 0;
            } else if (currentScore === localBestScore && Math.random() > 0.5) {
                currentBoardState = testBoard.map(row => [...row]);
                stagnationCounter++;
            } else {
                stagnationCounter++;
            }

            await new Promise(resolve => setTimeout(resolve, 0));
        }

        setIsSolving(false);
    };

    return {
        tier, setTier, handleTierChange,
        targetStats, setTargetStats,
        maximizeStats, setMaximizeStats,
        inventory, setInventory,
        board, bestTotals, bestPieceStats,
        isSolving, warningMsg, setWarningMsg,
        runOptimization, resetBoard
    };
}