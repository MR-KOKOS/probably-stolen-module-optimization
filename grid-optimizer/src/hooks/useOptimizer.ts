import { useState, useRef, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import type {GridTier, InventoryItem, Stats, TargetStats, Point, ModuleShape, ModuleColor, ItemEffect} from '../types';
import { getBaseStats, getEffectiveBaseStats, applyInternalEffects, PRECOMPUTED_OFFSETS } from '../utils';
import { MODULE_TEMPLATES } from '../constants';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://yhiojdutwgfxrgakbrjs.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloaW9qZHV0d2dmeHJnYWticmpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0ODcwMjMsImV4cCI6MjEwMjA2MzAyM30.lVkU06tLfM64aFYL2Gx-UMPFL9KCRSaadu58TDWMmSI';
const supabase = createClient(supabaseUrl, supabaseKey);

const SHAPE_MAP: ModuleShape[] = ['Node1x2', 'L3', 'L4_Base', 'T4_Base', 'Square4_Base', 'L4_High', 'T4_High', 'Square4_High', 'P5', 'C5', 'Line4'];
const COLOR_MAP_KEYS: ModuleColor[] = ['White', 'Red', 'Yellow', 'Green', 'Purple', 'DarkRed', 'Grey'];
const EFFECT_MAP: ItemEffect[] = ['None', 'Premium', 'Inferior', 'Overcharged', 'Degrading', 'Negative Feedback', 'Receiver', 'Side Mount', 'Top Mount', 'Learning Algorithm'];

const BASE85_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#";

function encodeBase85(bytes: Uint8Array): string {
    let num = 1n;
    for (let i = 0; i < bytes.length; i++) {
        num = (num << 8n) | BigInt(bytes[i]);
    }
    let str = "";
    while (num > 0n) {
        str = BASE85_ALPHABET[Number(num % 85n)] + str;
        num /= 85n;
    }
    return str;
}

function decodeBase85(str: string): Uint8Array {
    str = str.trim();
    let num = 0n;
    for (let i = 0; i < str.length; i++) {
        const val = BASE85_ALPHABET.indexOf(str[i]);
        if (val === -1) throw new Error("Invalid base85 character");
        num = (num * 85n) + BigInt(val);
    }
    let hex = num.toString(16);
    if (hex.length % 2 !== 0) hex = '0' + hex;
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes.slice(1);
}

class BitWriter {
    bytes: number[] = [];
    currentByte = 0;
    bitPos = 0;

    write(value: number, numBits: number) {
        for (let i = numBits - 1; i >= 0; i--) {
            const bit = (value >> i) & 1;
            this.currentByte = (this.currentByte << 1) | bit;
            this.bitPos++;
            if (this.bitPos === 8) {
                this.bytes.push(this.currentByte);
                this.currentByte = 0;
                this.bitPos = 0;
            }
        }
    }

    toBase85(): string {
        if (this.bitPos > 0) {
            this.bytes.push(this.currentByte << (8 - this.bitPos));
        }
        return encodeBase85(new Uint8Array(this.bytes));
    }
}

class BitReader {
    bytes: Uint8Array;
    bytePos = 0;
    bitPos = 7;

    constructor(base85: string) {
        this.bytes = decodeBase85(base85);
    }

    read(numBits: number): number {
        let value = 0;
        for (let i = 0; i < numBits; i++) {
            if (this.bytePos >= this.bytes.length) throw new Error("EOF");
            const bit = (this.bytes[this.bytePos] >> this.bitPos) & 1;
            value = (value << 1) | bit;
            this.bitPos--;
            if (this.bitPos < 0) {
                this.bitPos = 7;
                this.bytePos++;
            }
        }
        return value;
    }
}

const roundStat = (val: number) => val < 0 ? Math.ceil(val) : Math.floor(val);

export function useOptimizer() {
    const [tier, setTier] = useState<GridTier>(3);

    const [targetStats, setTargetStats] = useState<TargetStats>({ Performance: null, Quality: null, Efficiency: null });
    const [maximizeStats, setMaximizeStats] = useState({ Performance: false, Quality: false, Efficiency: false });

    const [inventory, setInventory] = useState<InventoryItem[]>(() => {
        const savedInventory = localStorage.getItem('optimizer_inventory');
        if (savedInventory) {
            try {
                return JSON.parse(savedInventory);
            } catch (e) {
                console.error("Failed to parse saved inventory", e);
                return [];
            }
        }
        return [];
    });
    const [board, setBoard] = useState<(InventoryItem | 'Locked' | null)[][]>(() => initializeBoard(3));
    const [bestTotals, setBestTotals] = useState<Stats>({ Performance: 0, Quality: 0, Efficiency: 0 });
    const [bestPieceStats, setBestPieceStats] = useState<Map<string, Stats>>(new Map());

    const [isSolving, setIsSolving] = useState(false);
    const [warningMsg, setWarningMsg] = useState<string | null>(null);
    const [solutionCode, setSolutionCode] = useState<string>('');
    const isSolvingRef = useRef(false);

    useEffect(() => {
        localStorage.setItem('optimizer_inventory', JSON.stringify(inventory));
    }, [inventory]);

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
        setSolutionCode('');
    };

    const resetBoard = () => {
        if (isSolving) {
            isSolvingRef.current = false;
            setIsSolving(false);
        }
        setBoard(initializeBoard(tier));
        setBestTotals({ Performance: 0, Quality: 0, Efficiency: 0 });
        setBestPieceStats(new Map());

        setWarningMsg(null);
        setTargetStats({ Performance: null, Quality: null, Efficiency: null });
        setMaximizeStats({ Performance: false, Quality: false, Efficiency: false });
        setSolutionCode('');
    };

    const calculateBoardStats = (currentBoard: (InventoryItem | 'Locked' | null)[][], currentInventory: InventoryItem[] = inventory) => {
        const totals: Stats = { Performance: 0, Quality: 0, Efficiency: 0 };
        const pieceStats = new Map<string, Stats>();
        let coveredNodeSides = 0;
        let negativeContactCount = 0;
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
                    const cell = currentInventory.find(i => i.id === boardCell.id) || boardCell;
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
                                    const adj = currentInventory.find(i => i.id === adjBoardCell.id) || adjBoardCell;
                                    if (adj.color !== 'White') {
                                        nodeAdjacencies.get(cell.id)!.add(adj.id);
                                        coveredNodeSides++;

                                        const adjModified = applyInternalEffects(adj);
                                        const isPureNegative =
                                            (roundStat(adjModified.Performance) <= 0 && roundStat(adjModified.Quality) <= 0 && roundStat(adjModified.Efficiency) <= 0) &&
                                            (roundStat(adjModified.Performance) < 0 || roundStat(adjModified.Quality) < 0 || roundStat(adjModified.Efficiency) < 0);

                                        if (isPureNegative) {
                                            negativeContactCount++;
                                        }
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

                modified.Performance = roundStat(modified.Performance);
                modified.Quality = roundStat(modified.Quality);
                modified.Efficiency = roundStat(modified.Efficiency);

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
                    p = roundStat(p * (1 + multiplier));
                    q = roundStat(q * (1 + multiplier));
                    e = roundStat(e * (1 + multiplier));
                }

                const finalStats = {
                    Performance: roundStat(p),
                    Quality: roundStat(q),
                    Efficiency: roundStat(e)
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
                Performance: roundStat(nodeP * 0.20),
                Quality: roundStat(nodeQ * 0.20),
                Efficiency: roundStat(nodeE * 0.20)
            };

            pieceStats.set(nodeId, nodeStat);
            totals.Performance += nodeStat.Performance;
            totals.Quality += nodeStat.Quality;
            totals.Efficiency += nodeStat.Efficiency;
        });

        return { totals, pieceStats, coveredNodeSides, negativeContactCount, placedPiecesCount, placedAlarmsCount, placedJunkCount, placedBlastCount };
    };

    const importSolution = (code: string) => {
        try {
            const reader = new BitReader(code);

            const decodedTier = reader.read(2) as GridTier;
            setTier(decodedTier);

            const maxP = reader.read(1) === 1;
            const maxQ = reader.read(1) === 1;
            const maxE = reader.read(1) === 1;
            setMaximizeStats({ Performance: maxP, Quality: maxQ, Efficiency: maxE });

            const readTarget = () => {
                const hasTarget = reader.read(1) === 1;
                if (!hasTarget) return null;
                return reader.read(12) - 2048;
            };

            setTargetStats({
                Performance: readTarget(),
                Quality: readTarget(),
                Efficiency: readTarget()
            });

            const newInventory: InventoryItem[] = [];
            const newBoard: (InventoryItem | 'Locked' | null)[][] = Array.from({ length: 5 }, () => Array.from({ length: 7 }, () => null));

            if (decodedTier === 1 || decodedTier === 2) {
                newBoard[0][0] = newBoard[0][6] = newBoard[4][0] = newBoard[4][6] = 'Locked';
            }
            if (decodedTier === 1) {
                newBoard[1][3] = newBoard[2][2] = newBoard[2][3] = newBoard[2][4] = newBoard[3][3] = 'Locked';
            }

            const numModules = reader.read(8);

            for (let i = 0; i < numModules; i++) {
                const shapeIdx = reader.read(4);
                const colorIdx = reader.read(3);
                const shape = SHAPE_MAP[shapeIdx];
                const color = COLOR_MAP_KEYS[colorIdx];

                const posCount = reader.read(3);
                const positions: number[] = [];
                for (let p = 0; p < posCount; p++) {
                    positions.push(reader.read(6));
                }

                const template = shape === 'Node1x2'
                    ? { displayName: 'Node' }
                    : MODULE_TEMPLATES.find(m => m.shape === shape && m.color === color) || { displayName: 'Unknown Module' };

                const reconstructedEffects: [ItemEffect, ItemEffect] = ['None', 'None'];
                const base = getBaseStats({ shape, color, displayName: template.displayName } as any);

                const maxBaseValue = Math.max(
                    Math.abs(base.Performance),
                    Math.abs(base.Quality),
                    Math.abs(base.Efficiency)
                );
                const defaultDoubleBase = maxBaseValue * 2;
                const reconstructedValues: [number, number] = [defaultDoubleBase, defaultDoubleBase];

                for (let eIdx = 0; eIdx < 2; eIdx++) {
                    const hasEffect = reader.read(1) === 1;
                    if (hasEffect) {
                        const effIdx = reader.read(4);
                        const eff = EFFECT_MAP[effIdx];
                        reconstructedEffects[eIdx] = eff;

                        const hasValue = reader.read(1) === 1;

                        if (eff === 'Learning Algorithm' || eff === 'Degrading') {
                            if (hasValue) {
                                reconstructedValues[eIdx] = reader.read(12) - 2048;
                            }
                        }
                    }
                }

                const newItem: InventoryItem = {
                    id: `${shape}_${color}_${Math.random().toString(36).substring(2, 8)}`,
                    shape,
                    color,
                    displayName: template.displayName,
                    effects: reconstructedEffects,
                    effectValues: reconstructedValues
                };
                newInventory.push(newItem);

                positions.forEach((pos: number) => {
                    const y = Math.floor(pos / 7);
                    const x = pos % 7;
                    newBoard[y][x] = newItem;
                });
            }

            setInventory(newInventory);
            setBoard(newBoard);
            setSolutionCode(code);
            setWarningMsg(null);

            const { totals, pieceStats } = calculateBoardStats(newBoard, newInventory);
            setBestTotals(totals);
            setBestPieceStats(new Map(pieceStats));

        } catch (e) {
            setWarningMsg("Failed to import solution code.");
        }
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
    }, [inventory, board]);

    const runOptimization = async () => {
        if (isSolving) {
            isSolvingRef.current = false;
            return;
        }

        if (inventory.length === 0) {
            setWarningMsg(`Cannot optimize: You have no modules selected.`);
            return;
        }

        setSolutionCode('');
        let activeMax = { ...maximizeStats };
        let activeTar = { ...targetStats };

        const hasAnyPositiveStats = inventory.some(item => {
            const modified = applyInternalEffects(item);
            return roundStat(modified.Performance) > 0 || roundStat(modified.Quality) > 0 || roundStat(modified.Efficiency) > 0;
        });

        if (!hasAnyPositiveStats) {
            setWarningMsg(`Selected modules have no stats. Optimizing for space/packing.`);
        } else {
            const validForCurrentGoals = inventory.some(item => {
                const mod = applyInternalEffects(item);
                return (activeMax.Performance && roundStat(mod.Performance) > 0) ||
                    (activeMax.Quality && roundStat(mod.Quality) > 0) ||
                    (activeMax.Efficiency && roundStat(mod.Efficiency) > 0) ||
                    (activeTar.Performance !== null && roundStat(mod.Performance) !== 0) ||
                    (activeTar.Quality !== null && roundStat(mod.Quality) !== 0) ||
                    (activeTar.Efficiency !== null && roundStat(mod.Efficiency) !== 0);
            });

            if (!validForCurrentGoals) {
                const redCount = inventory.filter(i => roundStat(applyInternalEffects(i).Performance) > 0).length;
                const yellowCount = inventory.filter(i => roundStat(applyInternalEffects(i).Quality) > 0).length;
                const greenCount = inventory.filter(i => roundStat(applyInternalEffects(i).Efficiency) > 0).length;

                let autoGoal: keyof Stats = 'Performance';
                if (redCount >= yellowCount && redCount >= greenCount && redCount > 0) autoGoal = 'Performance';
                else if (yellowCount >= redCount && yellowCount >= greenCount && yellowCount > 0) autoGoal = 'Quality';
                else if (greenCount >= redCount && greenCount >= yellowCount && greenCount > 0) autoGoal = 'Efficiency';

                activeTar = { Performance: null, Quality: null, Efficiency: null };
                activeMax = { Performance: false, Quality: false, Efficiency: false };
                activeMax[autoGoal] = true;

                setTargetStats(activeTar);
                setMaximizeStats(activeMax);

                const isAnyGoalSetInitially = maximizeStats.Performance || maximizeStats.Quality || maximizeStats.Efficiency || targetStats.Performance !== null || targetStats.Quality !== null || targetStats.Efficiency !== null;

                if (!isAnyGoalSetInitially) {
                    setWarningMsg(`No stat selected. Auto-maximizing majority type: ${autoGoal}`);
                } else {
                    setWarningMsg(`Selected modules do not provide targeted stats. Auto-maximizing majority type: ${autoGoal}`);
                }
            } else {
                setWarningMsg(null);
            }
        }

        let weightP = activeMax.Performance ? 10 : 0.1;
        let weightQ = activeMax.Quality ? 10 : 0.1;
        let weightE = activeMax.Efficiency ? 10 : 0.1;
        if (activeTar.Performance !== null) weightP += 15;
        if (activeTar.Quality !== null) weightQ += 15;
        if (activeTar.Efficiency !== null) weightE += 15;

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

            if (activeTar.Performance !== null && t.Performance < activeTar.Performance) score -= (activeTar.Performance - t.Performance) * 10000;
            if (activeTar.Quality !== null && t.Quality < activeTar.Quality) score -= (activeTar.Quality - t.Quality) * 10000;
            if (activeTar.Efficiency !== null && t.Efficiency < activeTar.Efficiency) score -= (activeTar.Efficiency - t.Efficiency) * 10000;

            if (activeMax.Performance) score += (t.Performance * 10);
            if (activeMax.Quality) score += (t.Quality * 10);
            if (activeMax.Efficiency) score += (t.Efficiency * 10);

            return score;
        };

        setIsSolving(true);
        isSolvingRef.current = true;

        let localBestScore = -Infinity;
        let currentBoardState = initializeBoard(tier);
        let localBestTotals = { Performance: 0, Quality: 0, Efficiency: 0 };

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
                    nodeBonusScore += roundStat(base.Performance * 0.20) * weightP;
                    nodeBonusScore += roundStat(base.Quality * 0.20) * weightQ;
                    nodeBonusScore += roundStat(base.Efficiency * 0.20) * weightE;
                } else if (piece.color === 'White' && adjPiece.color !== 'White') {
                    const adjBase = precomputedBase.get(adjId)!;
                    nodeBonusScore += roundStat(adjBase.Performance * 0.20) * weightP;
                    nodeBonusScore += roundStat(adjBase.Quality * 0.20) * weightQ;
                    nodeBonusScore += roundStat(adjBase.Efficiency * 0.20) * weightE;
                }

                if (nfCount > 0 && adjPiece.color !== 'White') {
                    const adjBase = precomputedBase.get(adjId)!;
                    if (adjBase.Performance < 0) negFeedbackBonus += roundStat(nfCount * 0.25 * adjBase.Performance);
                    if (adjBase.Quality < 0) negFeedbackBonus += roundStat(nfCount * 0.25 * adjBase.Quality);
                    if (adjBase.Efficiency < 0) negFeedbackBonus += roundStat(nfCount * 0.25 * adjBase.Efficiency);
                }
            });

            if (hasReceiver) multiplier += (0.10 * adjNodes);

            if (multiplier > 0) {
                p = roundStat(p * (1 + multiplier));
                q = roundStat(q * (1 + multiplier));
                e = roundStat(e * (1 + multiplier));
            }

            p += negFeedbackBonus;
            q += negFeedbackBonus;
            e += negFeedbackBonus;

            const statScore = (p * weightP) + (q * weightQ) + (e * weightE) + nodeBonusScore;
            return statScore + (adjNodes * 0.05) - (negativeContactCount * 1000);
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
                localBestTotals = totals;
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

        const writer = new BitWriter();

        writer.write(tier, 2);

        writer.write(activeMax.Performance ? 1 : 0, 1);
        writer.write(activeMax.Quality ? 1 : 0, 1);
        writer.write(activeMax.Efficiency ? 1 : 0, 1);

        const writeTarget = (val: number | null) => {
            if (val === null) {
                writer.write(0, 1);
            } else {
                writer.write(1, 1);
                writer.write(val + 2048, 12);
            }
        };
        writeTarget(activeTar.Performance);
        writeTarget(activeTar.Quality);
        writeTarget(activeTar.Efficiency);

        writer.write(inventory.length, 8);

        const placedItemsMap = new Map<string, number[]>();
        currentBoardState.forEach((row, y) => row.forEach((cell, x) => {
            if (cell && cell !== 'Locked') {
                if (!placedItemsMap.has(cell.id)) {
                    placedItemsMap.set(cell.id, []);
                }
                placedItemsMap.get(cell.id)!.push(y * 7 + x);
            }
        }));

        inventory.forEach(item => {
            writer.write(SHAPE_MAP.indexOf(item.shape), 4);
            writer.write(COLOR_MAP_KEYS.indexOf(item.color), 3);

            const positions = placedItemsMap.get(item.id) || [];
            writer.write(positions.length, 3);
            positions.forEach(p => writer.write(p, 6));

            item.effects.forEach((eff, idx) => {
                if (eff === 'None') {
                    writer.write(0, 1);
                } else {
                    writer.write(1, 1);
                    writer.write(EFFECT_MAP.indexOf(eff), 4);

                    if (eff === 'Learning Algorithm' || eff === 'Degrading') {
                        writer.write(1, 1);
                        writer.write(item.effectValues[idx] + 2048, 12);
                    } else {
                        writer.write(0, 1);
                    }
                }
            });
        });

        const generatedCode = writer.toBase85();
        setSolutionCode(generatedCode);

        const hasNeuralCore = inventory.some(item => item.displayName.includes('Neural Core'));
        const averageStat = (localBestTotals.Performance + localBestTotals.Quality + localBestTotals.Efficiency) / 3;

        const submission = {
            tier,
            has_neural_core: hasNeuralCore,
            performance: localBestTotals.Performance,
            quality: localBestTotals.Quality,
            efficiency: localBestTotals.Efficiency,
            average_stat: parseFloat(averageStat.toFixed(2)),
            solution_code: generatedCode
        };

        supabase.from('leaderboards').insert([submission]).then(({ error }) => {
            if (error) console.error(error);
        });
    };

    return {
        tier, setTier, handleTierChange,
        targetStats, setTargetStats,
        maximizeStats, setMaximizeStats,
        inventory, setInventory,
        board, bestTotals, bestPieceStats,
        isSolving, warningMsg, setWarningMsg,
        solutionCode, setSolutionCode, importSolution,
        runOptimization, resetBoard
    };
}