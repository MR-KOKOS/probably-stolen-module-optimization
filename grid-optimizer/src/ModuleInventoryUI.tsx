import React, { useState, useRef } from 'react';

// Config
type GridTier = 1 | 2 | 3;
type Goal = 'Performance' | 'Quality' | 'Efficiency';
type ModuleColor = 'White' | 'Red' | 'Yellow' | 'Green';
type ModuleShape =
    | 'Node1x2' | 'L3' | 'L4_Base' | 'T4_Base' | 'Square4_Base'
    | 'L4_High' | 'T4_High' | 'Square4_High' | 'P5';

type FilterColor = 'All' | 'Red' | 'Yellow' | 'Green';
type FilterSize = 'All' | 3 | 4 | 5;
type FilterShape = 'All' | 'L' | 'T' | 'Square' | 'P';
type FilterTier = 'All' | 'Base' | 'High';

interface InventoryItem {
    id: string;
    shape: ModuleShape;
    color: ModuleColor;
    displayName: string;
}

interface ModuleTemplate {
    shape: ModuleShape;
    color: ModuleColor;
    size: number;
    tier: 'Base' | 'High';
    shapeType: string;
}

interface Stats {
    Performance: number;
    Quality: number;
    Efficiency: number;
}

type Point = { x: number; y: number };

// Dictionaries
const SHAPE_DEFINITIONS: { [key in ModuleShape]: number[][] } = {
    Node1x2: [[1], [1]],
    L3: [[1, 0], [1, 1]],
    L4_Base: [[1, 0], [1, 0], [1, 1]],
    T4_Base: [[1, 1, 1], [0, 1, 0]],
    Square4_Base: [[1, 1], [1, 1]],
    L4_High: [[1, 0], [1, 0], [1, 1]],
    T4_High: [[1, 1, 1], [0, 1, 0]],
    Square4_High: [[1, 1], [1, 1]],
    P5: [[1, 1], [1, 1], [1, 0]],
};

const COLOR_MAP: { [key in ModuleColor]: string } = {
    White: '#e0e0e0',
    Red: '#ff4d4d',
    Yellow: '#ffd700',
    Green: '#4caf50',
};

// generate master list of colored templates
const COLORED_MODULE_TEMPLATES: ModuleTemplate[] = [];
(['Red', 'Yellow', 'Green'] as ModuleColor[]).forEach((color) => {
    COLORED_MODULE_TEMPLATES.push({ shape: 'L3', color, size: 3, tier: 'Base', shapeType: 'L' });
    COLORED_MODULE_TEMPLATES.push({ shape: 'L4_Base', color, size: 4, tier: 'Base', shapeType: 'L' });
    COLORED_MODULE_TEMPLATES.push({ shape: 'T4_Base', color, size: 4, tier: 'Base', shapeType: 'T' });
    COLORED_MODULE_TEMPLATES.push({ shape: 'Square4_Base', color, size: 4, tier: 'Base', shapeType: 'Square' });
    COLORED_MODULE_TEMPLATES.push({ shape: 'L4_High', color, size: 4, tier: 'High', shapeType: 'L' });
    COLORED_MODULE_TEMPLATES.push({ shape: 'T4_High', color, size: 4, tier: 'High', shapeType: 'T' });
    COLORED_MODULE_TEMPLATES.push({ shape: 'Square4_High', color, size: 4, tier: 'High', shapeType: 'Square' });
    COLORED_MODULE_TEMPLATES.push({ shape: 'P5', color, size: 5, tier: 'High', shapeType: 'P' });
});

const NODE_TEMPLATE: ModuleTemplate = { shape: 'Node1x2', color: 'White', size: 2, tier: 'Base', shapeType: 'Node' };

const getBaseStats = (shape: ModuleShape, color: ModuleColor): Stats => {
    const stats = { Performance: 0, Quality: 0, Efficiency: 0 };
    if (shape === 'Node1x2') return stats;

    const isL3 = shape === 'L3';
    const isBase4 = shape.includes('_Base');
    const isHigh4 = shape.includes('_High');
    const isP5 = shape === 'P5';

    if (color === 'Red') {
        if (isL3) stats.Performance = 12;
        if (isBase4) stats.Performance = 16;
        if (isHigh4) { stats.Performance = 36; stats.Efficiency = -44; }
        if (isP5) { stats.Performance = 45; stats.Efficiency = -55; }
    } else if (color === 'Yellow') {
        if (isL3) stats.Quality = 6;
        if (isBase4) stats.Quality = 8;
        if (isHigh4) { stats.Performance = -8; stats.Quality = 25; stats.Efficiency = -15; }
        if (isP5) { stats.Performance = -10; stats.Quality = 31; stats.Efficiency = -18; }
    } else if (color === 'Green') {
        if (isL3) stats.Efficiency = 12;
        if (isBase4) stats.Efficiency = 16;
        if (isHigh4) { stats.Performance = -16; stats.Efficiency = 32; }
        if (isP5) { stats.Performance = -20; stats.Efficiency = 40; }
    }
    return stats;
};

const getDisplayName = (shape: ModuleShape, color: ModuleColor): string => {
    if (shape === 'Node1x2') return 'Node';
    const isHighTier = shape.includes('_High') || shape === 'P5';
    if (color === 'Red') return isHighTier ? 'Overclock' : 'Performance';
    if (color === 'Yellow') return isHighTier ? 'Refinement' : 'Quality';
    if (color === 'Green') return isHighTier ? 'Eco' : 'Efficiency';
    return 'Unknown';
};

const renderMiniShape = (shape: ModuleShape, colorHex: string, size = '14px') => {
    const layout = SHAPE_DEFINITIONS[shape];
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', justifyContent: 'center' }}>
            {layout.map((row, rIdx) => (
                <div key={rIdx} style={{ display: 'flex', gap: '0px' }}>
                    {row.map((cell, cIdx) => (
                        <div key={cIdx} style={{ width: size, height: size, backgroundColor: cell ? colorHex : 'transparent', border: cell ? '1px solid #000' : 'none' }} />
                    ))}
                </div>
            ))}
        </div>
    );
};

const formatStatValue = (val: number) => {
    const rounded = Number(val.toFixed(1));
    return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
};

const getStatColor = (val: number) => {
    return val > 0 ? '#4caf50' : (val < 0 ? '#ff4d4d' : '#888');
};

const rotateMatrix = (m: number[][]) => m[0].map((_, idx) => m.map(row => row[idx]).reverse());
const flipMatrix = (m: number[][]) => m.map(row => [...row].reverse());

const matrixToOffsets = (matrix: number[][]): Point[] => {
    const points: Point[] = [];
    for (let y = 0; y < matrix.length; y++) {
        for (let x = 0; x < matrix[y].length; x++) {
            if (matrix[y][x]) points.push({ x, y });
        }
    }
    const minY = Math.min(...points.map(p => p.y));
    const topRow = points.filter(p => p.y === minY);
    const minX = Math.min(...topRow.map(p => p.x));
    return points.map(p => ({ x: p.x - minX, y: p.y - minY })).sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
};

const generateAllOffsets = (baseMatrix: number[][]): Point[][] => {
    const offsetsMap = new Set<string>();
    const result: Point[][] = [];
    let current = baseMatrix;

    for (let i = 0; i < 4; i++) {
        const normalPts = matrixToOffsets(current);
        const normalHash = JSON.stringify(normalPts);
        if (!offsetsMap.has(normalHash)) { offsetsMap.add(normalHash); result.push(normalPts); }

        const flippedPts = matrixToOffsets(flipMatrix(current));
        const flippedHash = JSON.stringify(flippedPts);
        if (!offsetsMap.has(flippedHash)) { offsetsMap.add(flippedHash); result.push(flippedPts); }

        current = rotateMatrix(current);
    }
    return result;
};

const PRECOMPUTED_OFFSETS = new Map<ModuleShape, Point[][]>();
(Object.keys(SHAPE_DEFINITIONS) as ModuleShape[]).forEach(shape => {
    PRECOMPUTED_OFFSETS.set(shape, generateAllOffsets(SHAPE_DEFINITIONS[shape]));
});

export default function ModuleInventoryUI() {
    const [tier, setTier] = useState<GridTier>(3);
    const [goal, setGoal] = useState<Goal>('Performance');
    const [inventory, setInventory] = useState<InventoryItem[]>([]);

    // filtering states
    const [filterColor, setFilterColor] = useState<FilterColor>('All');
    const [filterSize, setFilterSize] = useState<FilterSize>('All');
    const [filterShape, setFilterShape] = useState<FilterShape>('All');
    const [filterTier, setFilterTier] = useState<FilterTier>('All');

    const [board, setBoard] = useState<(InventoryItem | 'Locked' | null)[][]>(() => initializeBoard(3));
    const [bestTotals, setBestTotals] = useState<Stats>({ Performance: 0, Quality: 0, Efficiency: 0 });
    const [bestPieceStats, setBestPieceStats] = useState<Map<string, Stats>>(new Map());

    // tooltip states
    const [hoverInfo, setHoverInfo] = useState<{ x: number, y: number, cell: InventoryItem } | null>(null);

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
        setBoard(initializeBoard(tier));
        setBestTotals({ Performance: 0, Quality: 0, Efficiency: 0 });
        setBestPieceStats(new Map());
        setWarningMsg(null);
        isSolvingRef.current = false;
        setIsSolving(false);
    };

    const addPieceToInventory = (template: ModuleTemplate) => {
        setInventory((prev) => [...prev, {
            id: `${template.shape}_${template.color}_${Math.random().toString(36).substring(2, 8)}`,
            shape: template.shape,
            color: template.color,
            displayName: getDisplayName(template.shape, template.color)
        }]);
    };

    const calculateBoardStats = (currentBoard: (InventoryItem | 'Locked' | null)[][]) => {
        const totals: Stats = { Performance: 0, Quality: 0, Efficiency: 0 };
        const pieceStats = new Map<string, Stats>();
        let coveredNodeSides = 0;

        const offsets = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
        const placedPieces = new Map<string, InventoryItem>();
        const nodeAdjacencies = new Map<string, Set<string>>();

        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < 7; x++) {
                const cell = currentBoard[y][x];
                if (cell && cell !== 'Locked') {
                    placedPieces.set(cell.id, cell);

                    if (cell.color === 'White') {
                        if (!nodeAdjacencies.has(cell.id)) nodeAdjacencies.set(cell.id, new Set());
                        offsets.forEach(off => {
                            const nx = x + off.x; const ny = y + off.y;
                            if (nx >= 0 && nx < 7 && ny >= 0 && ny < 5) {
                                const adj = currentBoard[ny][nx];
                                if (adj && adj !== 'Locked' && adj.color !== 'White') {
                                    nodeAdjacencies.get(cell.id)!.add(adj.id);
                                    placedPieces.set(adj.id, adj);
                                    coveredNodeSides++;
                                }
                            }
                        });
                    }
                }
            }
        }

        placedPieces.forEach((p, id) => {
            if (p.color !== 'White') {
                const base = getBaseStats(p.shape, p.color);
                pieceStats.set(id, { ...base });
                totals.Performance += base.Performance;
                totals.Quality += base.Quality;
                totals.Efficiency += base.Efficiency;
            }
        });

        nodeAdjacencies.forEach((adjIds, nodeId) => {
            const nodeStat = { Performance: 0, Quality: 0, Efficiency: 0 };
            adjIds.forEach(adjId => {
                const adjPiece = placedPieces.get(adjId)!;
                const base = getBaseStats(adjPiece.shape, adjPiece.color);
                nodeStat.Performance += (base.Performance * 0.20);
                nodeStat.Quality += (base.Quality * 0.20);
                nodeStat.Efficiency += (base.Efficiency * 0.20);
            });
            pieceStats.set(nodeId, nodeStat);
            totals.Performance += nodeStat.Performance;
            totals.Quality += nodeStat.Quality;
            totals.Efficiency += nodeStat.Efficiency;
        });

        return { totals, pieceStats, coveredNodeSides };
    };

    const runOptimization = async () => {
        if (isSolving) {
            isSolvingRef.current = false;
            return;
        }

        const hasValidModules = inventory.some(item => getBaseStats(item.shape, item.color)[goal] > 0);
        if (!hasValidModules) {
            setWarningMsg(`Cannot optimize: You have no modules that provide base ${goal} stats.`);
            return;
        }

        setWarningMsg(null);
        setIsSolving(true);
        isSolvingRef.current = true;

        let localBestScore = bestTotals[goal];
        let bestBoardState = JSON.parse(JSON.stringify(board));

        while (isSolvingRef.current) {
            let currentBoard = initializeBoard(tier);
            const shuffledInventory = [...inventory].sort(() => Math.random() - 0.5);

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
                                const score = stats.totals[goal];
                                const heuristicScore = score + (stats.coveredNodeSides * 0.01);

                                validPlacements.push({ x, y, offsets, score, heuristicScore });
                                for (const pt of offsets) currentBoard[y + pt.y][x + pt.x] = null;
                            }
                        }
                    }
                }

                if (validPlacements.length > 0) {
                    validPlacements.sort((a, b) => b.heuristicScore - a.heuristicScore);
                    const topN = Math.min(3, validPlacements.length);
                    const picked = validPlacements[Math.floor(Math.random() * topN)];
                    for (const pt of picked.offsets) {
                        currentBoard[picked.y + pt.y][picked.x + pt.x] = piece;
                    }
                }
            }

            const { totals, pieceStats } = calculateBoardStats(currentBoard);

            if (totals[goal] > localBestScore) {
                localBestScore = totals[goal];
                bestBoardState = JSON.parse(JSON.stringify(currentBoard));
                setBestTotals(totals);
                setBestPieceStats(new Map(pieceStats));
                setBoard(bestBoardState);
            }

            await new Promise(resolve => setTimeout(resolve, 0));
        }

        setIsSolving(false);
    };

    const getCellStyles = (x: number, y: number, cell: any): React.CSSProperties => {
        if (cell === 'Locked') {
            return { backgroundColor: '#111', border: 'none', boxShadow: 'none' };
        }

        if (!cell) {
            return { backgroundColor: '#2a2a2a', border: 'none', boxShadow: 'inset 0 0 0 1px #333' };
        }

        const isSame = (nx: number, ny: number) => {
            if (nx < 0 || nx >= 7 || ny < 0 || ny >= 5) return false;
            const adj = board[ny][nx];
            return adj && adj !== 'Locked' && (adj as InventoryItem).id === cell.id;
        };

        const bgColor = COLOR_MAP[cell.color as ModuleColor];
        const shadows: string[] = [];

        if (!isSame(x, y - 1)) shadows.push('inset 0 2px 0 #000');
        if (!isSame(x, y + 1)) shadows.push('inset 0 -2px 0 #000');
        if (!isSame(x - 1, y)) shadows.push('inset 2px 0 0 #000');
        if (!isSame(x + 1, y)) shadows.push('inset -2px 0 0 #000');

        return {
            backgroundColor: bgColor,
            border: 'none',
            boxShadow: shadows.join(', ') || 'none',
        };
    };

    // filtering logic
    const hasActiveFilters = filterColor !== 'All' || filterSize !== 'All' || filterShape !== 'All' || filterTier !== 'All';

    const filteredColoredModules = COLORED_MODULE_TEMPLATES.filter(m => {
        if (filterColor !== 'All' && m.color !== filterColor) return false;
        if (filterSize !== 'All' && m.size !== (filterSize as number)) return false;
        if (filterShape !== 'All' && m.shapeType !== filterShape) return false;
        if (filterTier !== 'All' && m.tier !== filterTier) return false;
        return true;
    });

    const catalogDisplayList = hasActiveFilters
        ? [...filteredColoredModules, NODE_TEMPLATE]
        : [NODE_TEMPLATE, ...filteredColoredModules];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#111', color: '#eee', fontFamily: 'sans-serif', padding: '20px' }}>

            {/* tooltips */}
            {hoverInfo && (
                <div style={{
                    position: 'fixed',
                    top: hoverInfo.y + 15,
                    left: hoverInfo.x + 15,
                    backgroundColor: 'rgba(0, 0, 0, 0.95)',
                    border: `1px solid ${COLOR_MAP[hoverInfo.cell.color]}`,
                    padding: '10px 15px',
                    borderRadius: '6px',
                    zIndex: 1000,
                    pointerEvents: 'none',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    minWidth: '150px'
                }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '8px', color: COLOR_MAP[hoverInfo.cell.color], borderBottom: '1px solid #333', paddingBottom: '5px' }}>
                        {hoverInfo.cell.displayName}
                    </div>
                    {bestPieceStats.has(hoverInfo.cell.id) ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.9em' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#aaa' }}>Perf:</span>
                                <span style={{ color: getStatColor(bestPieceStats.get(hoverInfo.cell.id)!.Performance) }}>{formatStatValue(bestPieceStats.get(hoverInfo.cell.id)!.Performance)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#aaa' }}>Qual:</span>
                                <span style={{ color: getStatColor(bestPieceStats.get(hoverInfo.cell.id)!.Quality) }}>{formatStatValue(bestPieceStats.get(hoverInfo.cell.id)!.Quality)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#aaa' }}>Effic:</span>
                                <span style={{ color: getStatColor(bestPieceStats.get(hoverInfo.cell.id)!.Efficiency) }}>{formatStatValue(bestPieceStats.get(hoverInfo.cell.id)!.Efficiency)}</span>
                            </div>
                        </div>
                    ) : (
                        <div style={{ color: '#888', fontSize: '0.9em' }}>Calculating...</div>
                    )}
                </div>
            )}

            {/* solving grid */}
            <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '30px' }}>

                <div style={{ display: 'flex', gap: '40px', marginBottom: '15px', backgroundColor: '#1a1a1a', padding: '15px 30px', borderRadius: '8px', border: '1px solid #333' }}>
                    <div style={{ textAlign: 'center' }}>
                        <span style={{ color: '#aaa', fontSize: '0.8em', textTransform: 'uppercase' }}>Performance</span>
                        <div style={{ fontSize: '1.6em', fontWeight: 'bold', color: getStatColor(bestTotals.Performance) }}>
                            {formatStatValue(bestTotals.Performance)}
                        </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <span style={{ color: '#aaa', fontSize: '0.8em', textTransform: 'uppercase' }}>Quality</span>
                        <div style={{ fontSize: '1.6em', fontWeight: 'bold', color: getStatColor(bestTotals.Quality) }}>
                            {formatStatValue(bestTotals.Quality)}
                        </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <span style={{ color: '#aaa', fontSize: '0.8em', textTransform: 'uppercase' }}>Efficiency</span>
                        <div style={{ fontSize: '1.6em', fontWeight: 'bold', color: getStatColor(bestTotals.Efficiency) }}>
                            {formatStatValue(bestTotals.Efficiency)}
                        </div>
                    </div>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 50px)',
                    gridTemplateRows: 'repeat(5, 50px)',
                    gap: '0px',
                    backgroundColor: '#222',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #333',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                }}>
                    {board.map((row, y) =>
                        row.map((cell, x) => (
                            <div
                                key={`${x}-${y}`}
                                onMouseMove={(e) => {
                                    if (cell && cell !== 'Locked') {
                                        setHoverInfo({ x: e.clientX, y: e.clientY, cell });
                                    }
                                }}
                                onMouseLeave={() => setHoverInfo(null)}
                                style={{
                                    width: '50px',
                                    height: '50px',
                                    ...getCellStyles(x, y, cell),
                                    cursor: cell && cell !== 'Locked' ? 'crosshair' : 'default',
                                    boxSizing: 'border-box'
                                }}
                            />
                        ))
                    )}
                </div>

                {warningMsg && (
                    <div style={{ color: '#ff4d4d', marginTop: '15px', fontWeight: 'bold', backgroundColor: 'rgba(255, 77, 77, 0.1)', padding: '8px 16px', borderRadius: '4px', border: '1px solid #ff4d4d' }}>
                        ⚠ {warningMsg}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '15px', marginTop: '20px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '5px', backgroundColor: '#222', padding: '5px', borderRadius: '6px' }}>
                        {[1, 2, 3].map((t) => (
                            <button key={t} onClick={() => handleTierChange(t as GridTier)} disabled={isSolving} style={{ padding: '8px 16px', backgroundColor: tier === t ? '#555' : 'transparent', color: 'white', border: 'none', borderRadius: '4px', cursor: isSolving ? 'not-allowed' : 'pointer' }}>
                                Tier {t}
                            </button>
                        ))}
                    </div>

                    <select value={goal} onChange={(e) => { setGoal(e.target.value as Goal); setWarningMsg(null); }} disabled={isSolving} style={{ padding: '10px', backgroundColor: '#222', color: 'white', border: 'none', borderRadius: '6px', cursor: isSolving ? 'not-allowed' : 'pointer', outline: 'none' }}>
                        <option value="Performance">Max Performance</option>
                        <option value="Quality">Max Quality</option>
                        <option value="Efficiency">Max Efficiency</option>
                    </select>

                    <button
                        onClick={resetBoard}
                        disabled={isSolving}
                        style={{ padding: '10px 16px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '6px', cursor: isSolving ? 'not-allowed' : 'pointer' }}
                    >
                        Clear Board
                    </button>

                    <button
                        onClick={runOptimization}
                        disabled={inventory.length === 0 && !isSolving}
                        style={{
                            padding: '10px 24px',
                            backgroundColor: isSolving ? '#ff4d4d' : '#4caf50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontWeight: 'bold',
                            cursor: (inventory.length === 0 && !isSolving) ? 'not-allowed' : 'pointer',
                            opacity: (inventory.length === 0 && !isSolving) ? 0.5 : 1
                        }}
                    >
                        {isSolving ? 'Stop Optimizer' : 'Run Optimizer'}
                    </button>
                </div>
            </div>

            {/* catalog and list */}
            <div style={{ display: 'flex', flex: '1', gap: '30px', minHeight: 0 }}>

                {/* module catalog */}
                <div style={{ flex: '2', backgroundColor: '#1a1a1a', padding: '20px', borderRadius: '8px', display: 'flex', flexDirection: 'column' }}>

                    {/* filters */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px solid #333' }}>
                        <select value={filterColor} onChange={(e) => setFilterColor(e.target.value as FilterColor)} style={{ padding: '6px 10px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px' }}>
                            <option value="All">All Types (Colors)</option>
                            <option value="Red">Performance (Red)</option>
                            <option value="Yellow">Quality (Yellow)</option>
                            <option value="Green">Efficiency (Green)</option>
                        </select>
                        <select value={filterSize} onChange={(e) => setFilterSize(e.target.value === 'All' ? 'All' : Number(e.target.value) as FilterSize)} style={{ padding: '6px 10px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px' }}>
                            <option value="All">All Sizes</option>
                            <option value={3}>Size 3</option>
                            <option value={4}>Size 4</option>
                            <option value={5}>Size 5</option>
                        </select>
                        <select value={filterShape} onChange={(e) => setFilterShape(e.target.value as FilterShape)} style={{ padding: '6px 10px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px' }}>
                            <option value="All">All Shapes</option>
                            <option value="L">L-Shape</option>
                            <option value="T">T-Shape</option>
                            <option value="Square">Square</option>
                            <option value="P">P-Shape</option>
                        </select>
                        <select value={filterTier} onChange={(e) => setFilterTier(e.target.value as FilterTier)} style={{ padding: '6px 10px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px' }}>
                            <option value="All">All Tiers</option>
                            <option value="Base">Normal Tier</option>
                            <option value="High">High Tier (Overclock/Eco/Refinement)</option>
                        </select>
                    </div>

                    {/* module list grid */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', overflowY: 'auto', alignContent: 'flex-start' }}>
                        {catalogDisplayList.map((template, idx) => (
                            <div
                                key={`${template.shape}_${template.color}_${idx}`}
                                onClick={() => addPieceToInventory(template)}
                                style={{ padding: '12px', width: '105px', backgroundColor: '#222', border: `1px solid ${COLOR_MAP[template.color]}`, cursor: 'pointer', borderRadius: '6px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                            >
                                <div style={{ height: '50px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    {renderMiniShape(template.shape, COLOR_MAP[template.color])}
                                </div>
                                <span style={{ fontSize: '0.7em', color: '#ccc', marginTop: '10px', textAlign: 'center', fontWeight: 'bold' }}>
                  {getDisplayName(template.shape, template.color)}
                </span>
                                <span style={{ fontSize: '0.65em', color: '#777', marginTop: '4px', textAlign: 'center' }}>
                  {template.shape === 'Node1x2' ? 'Size 2' : `Size ${template.size} ${template.tier}`}
                </span>
                            </div>
                        ))}
                        {catalogDisplayList.length === 1 && hasActiveFilters && (
                            <div style={{ color: '#666', fontStyle: 'italic', padding: '20px' }}>No colored modules match these filters.</div>
                        )}
                    </div>
                </div>

                {/* module list */}
                <div style={{ flex: '1', backgroundColor: '#1a1a1a', padding: '20px', borderRadius: '8px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center' }}>
                        <span style={{ color: '#888', fontSize: '0.9em' }}>{inventory.length} Selected</span>
                        <button
                            onClick={() => setInventory([])}
                            disabled={isSolving || inventory.length === 0}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: (isSolving || inventory.length === 0) ? '#555' : '#ff4d4d',
                                cursor: (isSolving || inventory.length === 0) ? 'not-allowed' : 'pointer',
                                fontSize: '0.85em',
                                textDecoration: 'underline'
                            }}
                        >
                            Clear List
                        </button>
                    </div>

                    <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '5px' }}>
                        {inventory.map((item) => (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: '#222', borderRadius: '4px', borderLeft: `4px solid ${COLOR_MAP[item.color]}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    {renderMiniShape(item.shape, COLOR_MAP[item.color], '10px')}
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: '0.9em', fontWeight: 'bold' }}>{item.displayName}</span>
                                    </div>
                                </div>
                                <button onClick={() => setInventory(prev => prev.filter(i => i.id !== item.id))} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '1.2em' }}>&times;</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}