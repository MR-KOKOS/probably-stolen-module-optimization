import { useState, useRef, useEffect } from 'react';
import type {GridTier, Goal, InventoryItem, Stats, Point} from '../types';
import { getBaseStats, applyInternalEffects, PRECOMPUTED_OFFSETS } from '../utils';

export function useOptimizer() {
    const [tier, setTier] = useState<GridTier>(3);
    const [goal, setGoal] = useState<Goal>('Performance');
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
    };

    const calculateBoardStats = (currentBoard: (InventoryItem | 'Locked' | null)[][]) => {
        const totals: Stats = { Performance: 0, Quality: 0, Efficiency: 0 };
        const pieceStats = new Map<string, Stats>();
        let coveredNodeSides = 0;
        let negativeContactCount = 0;
        let nodeNodeContactCount = 0;
        let placedPiecesCount = 0;

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

                                        const adjBase = getBaseStats(adj);
                                        const adjModified = applyInternalEffects(adjBase, adj.effects, adj.effectValues);
                                        const isPureNegative =
                                            (adjModified.Performance <= 0 && adjModified.Quality <= 0 && adjModified.Efficiency <= 0) &&
                                            (adjModified.Performance < 0 || adjModified.Quality < 0 || adjModified.Efficiency < 0);

                                        if (isPureNegative) {
                                            negativeContactCount++;
                                        }
                                    } else if (adj.id !== cell.id) {
                                        // Penalize Nodes touching other Nodes
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
            if (item.color !== 'White') {
                const base = getBaseStats(item);
                let modified = applyInternalEffects(base, item.effects, item.effectValues);

                const nfCount = item.effects.filter(e => e === 'Negative Feedback').length;
                if (nfCount > 0) {
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
                            const neighborBase = getBaseStats(neighborItem);
                            if (neighborBase.Performance < 0) {
                                modified.Performance += nfCount * 0.25 * neighborBase.Performance;
                            }
                            if (neighborBase.Quality < 0) {
                                modified.Quality += nfCount * 0.25 * neighborBase.Quality;
                            }
                            if (neighborBase.Efficiency < 0) {
                                modified.Efficiency += nfCount * 0.25 * neighborBase.Efficiency;
                            }
                        }
                    });
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
                    p *= (1 + multiplier);
                    q *= (1 + multiplier);
                    e *= (1 + multiplier);
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
            const nodeStat = { Performance: 0, Quality: 0, Efficiency: 0 };
            adjIds.forEach(adjId => {
                const adjacentItemData = placedPieces.get(adjId);
                if (adjacentItemData) {
                    const baseAdj = getBaseStats(adjacentItemData.item);
                    nodeStat.Performance += (baseAdj.Performance * 0.20);
                    nodeStat.Quality += (baseAdj.Quality * 0.20);
                    nodeStat.Efficiency += (baseAdj.Efficiency * 0.20);
                }
            });

            nodeStat.Performance = Math.trunc(nodeStat.Performance);
            nodeStat.Quality = Math.trunc(nodeStat.Quality);
            nodeStat.Efficiency = Math.trunc(nodeStat.Efficiency);

            pieceStats.set(nodeId, nodeStat);
            totals.Performance += nodeStat.Performance;
            totals.Quality += nodeStat.Quality;
            totals.Efficiency += nodeStat.Efficiency;
        });

        return { totals, pieceStats, coveredNodeSides, negativeContactCount, nodeNodeContactCount, placedPiecesCount };
    };

    useEffect(() => {
        if (!isSolvingRef.current) {
            const { totals, pieceStats } = calculateBoardStats(board);
            setBestTotals(totals);
            setBestPieceStats(new Map(pieceStats));
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

        const hasAnyPositiveStats = inventory.some(item => {
            const base = getBaseStats(item);
            const modified = applyInternalEffects(base, item.effects, item.effectValues);
            return modified.Performance > 0 || modified.Quality > 0 || modified.Efficiency > 0;
        });

        let activeGoal = goal;

        if (!hasAnyPositiveStats) {
            setWarningMsg(`Selected modules have no stats. Optimizing for space/packing.`);
        } else {
            const hasValidModules = inventory.some(item => {
                const base = getBaseStats(item);
                const modified = applyInternalEffects(base, item.effects, item.effectValues);
                return modified[goal] > 0;
            });

            if (!hasValidModules) {
                const redCount = inventory.filter(i => applyInternalEffects(getBaseStats(i), i.effects, i.effectValues).Performance > 0).length;
                const yellowCount = inventory.filter(i => applyInternalEffects(getBaseStats(i), i.effects, i.effectValues).Quality > 0).length;
                const greenCount = inventory.filter(i => applyInternalEffects(getBaseStats(i), i.effects, i.effectValues).Efficiency > 0).length;

                if (redCount >= yellowCount && redCount >= greenCount && redCount > 0) {
                    activeGoal = 'Performance';
                } else if (yellowCount >= redCount && yellowCount >= greenCount && yellowCount > 0) {
                    activeGoal = 'Quality';
                } else if (greenCount >= redCount && greenCount >= yellowCount && greenCount > 0) {
                    activeGoal = 'Efficiency';
                } else {
                    activeGoal = 'Performance';
                }

                setGoal(activeGoal);
                setWarningMsg(`No modules provide ${goal}. Optimizing for majority type: ${activeGoal}`);
            } else {
                setWarningMsg(null);
            }
        }

        setIsSolving(true);
        isSolvingRef.current = true;

        let localBestScore = -Infinity;
        let bestBoardState = initializeBoard(tier);

        while (isSolvingRef.current) {
            let currentBoard = initializeBoard(tier);

            const mandatoryItems = inventory.filter(piece =>
                piece.displayName.includes('Alarm Module') ||
                piece.displayName.includes('Junk Processing') ||
                piece.displayName.includes('Blast Module')
            );
            const optionalItems = inventory.filter(piece =>
                !piece.displayName.includes('Alarm Module') &&
                !piece.displayName.includes('Junk Processing') &&
                !piece.displayName.includes('Blast Module')
            );

            const getEffectiveStat = (item: InventoryItem) => {
                const base = getBaseStats(item);
                const modified = applyInternalEffects(base, item.effects, item.effectValues);
                return modified[activeGoal];
            };

            const optionalByShape = new Map<string, InventoryItem[]>();
            optionalItems.forEach(item => {
                if (!optionalByShape.has(item.shape)) optionalByShape.set(item.shape, []);
                optionalByShape.get(item.shape)!.push(item);
            });

            optionalByShape.forEach(list => {
                list.sort((a, b) => getEffectiveStat(b) - getEffectiveStat(a));
            });

            const shapeSequence = optionalItems.map(i => i.shape).sort(() => Math.random() - 0.5);

            const shuffledOptional = shapeSequence.map(shape => optionalByShape.get(shape)!.shift()!);

            const shuffledInventory = [
                ...mandatoryItems.sort(() => Math.random() - 0.5),
                ...shuffledOptional
            ];

            for (const piece of shuffledInventory) {
                const orientations = PRECOMPUTED_OFFSETS.get(piece.shape) || [];
                const validPlacements: { x: number, y: number, offsets: Point[], score: number, heuristicScore: number }[] = [];

                for (const offsets of orientations) {
                    for (let y = 0; y < 5; y++) {
                        for (let x = 0; x < 7; x++) {
                            let fits = true;
                            for (const pt of offsets) {
                                const nx = x + pt.x; const ny = y + pt.y;
                                if (nx < 0 || nx >= 7 || ny < 0 || ny >= 5 || currentBoard[ny][nx] !== null) {
                                    fits = false; break;
                                }
                            }

                            if (fits) {
                                for (const pt of offsets) currentBoard[y + pt.y][x + pt.x] = piece;
                                const stats = calculateBoardStats(currentBoard);

                                let score = hasAnyPositiveStats ? stats.totals[activeGoal] : stats.placedPiecesCount;
                                const heuristicScore = score + (stats.coveredNodeSides * 0.05) - (stats.negativeContactCount * 1000) - (stats.nodeNodeContactCount * 1000);

                                validPlacements.push({ x, y, offsets, score, heuristicScore });
                                for (const pt of offsets) currentBoard[y + pt.y][x + pt.x] = null;
                            }
                        }
                    }
                }

                if (validPlacements.length > 0) {
                    validPlacements.sort((a, b) => b.heuristicScore - a.heuristicScore);
                    const topN = Math.min(3, validPlacements.length);
                    const picked = validPlacements[Math.floor(Math.random() * topN)]; // Used for array index
                    for (const pt of picked.offsets) {
                        currentBoard[picked.y + pt.y][picked.x + pt.x] = piece;
                    }
                }
            }

            const { totals, pieceStats, placedPiecesCount } = calculateBoardStats(currentBoard);
            const currentScore = hasAnyPositiveStats ? totals[activeGoal] : placedPiecesCount;

            if (!isSolvingRef.current) break;

            if (currentScore > localBestScore) {
                localBestScore = currentScore;
                bestBoardState = JSON.parse(JSON.stringify(currentBoard));
                setBestTotals(totals);
                setBestPieceStats(new Map(pieceStats));
                setBoard(bestBoardState);
            }

            await new Promise(resolve => setTimeout(resolve, 0));
        }

        setIsSolving(false);
    };

    return {
        tier, setTier, handleTierChange,
        goal, setGoal,
        inventory, setInventory,
        board, bestTotals, bestPieceStats,
        isSolving, warningMsg, setWarningMsg,
        runOptimization, resetBoard
    };
}