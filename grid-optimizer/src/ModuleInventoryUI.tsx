import React, { useState } from 'react';
import type { Stats, GridTier, InventoryItem, FilterGroup, ItemEffect, ModuleTemplate, ModuleColor } from './types';
import { COLOR_MAP, EFFECTS_LIST, MODULE_TEMPLATES, NODE_TEMPLATE } from './constants';
import { formatStatValue, getStatColor, getBaseStats } from './utils';
import { useOptimizer } from './hooks/useOptimizer';
import MiniShape from './components/MiniShape';

export default function ModuleInventoryUI() {
    const {
        tier, handleTierChange,
        targetStats, setTargetStats,
        maximizeStats, setMaximizeStats,
        setWarningMsg,
        inventory, setInventory,
        board, bestTotals, bestPieceStats,
        isSolving, warningMsg,
        solutionCode, setSolutionCode, importSolution,
        runOptimization, resetBoard
    } = useOptimizer();

    const [filterGroup, setFilterGroup] = useState<FilterGroup>('All');
    const [filterSize, setFilterSize] = useState<'All' | 3 | 4 | 5>('All');
    const [hoverInfo, setHoverInfo] = useState<{ x: number, y: number, cell: InventoryItem } | null>(null);

    const hoveredItem = hoverInfo ? (inventory.find(i => i.id === hoverInfo.cell.id) || hoverInfo.cell) : null;

    const handleMaximizeToggle = (stat: keyof Stats) => {
        setMaximizeStats(prev => ({ ...prev, [stat]: !prev[stat] }));
        setWarningMsg(null);
    };

    const handleTargetChange = (stat: keyof Stats, value: number | null) => {
        setTargetStats(prev => ({ ...prev, [stat]: value }));
        setWarningMsg(null);
    };

    const addPieceToInventory = (template: ModuleTemplate) => {
        const base = getBaseStats(template);
        const maxPositiveBase = Math.max(
            base.Performance > 0 ? base.Performance : 0,
            base.Quality > 0 ? base.Quality : 0,
            base.Efficiency > 0 ? base.Efficiency : 0
        );
        const defaultDoubleBase = maxPositiveBase * 2;

        setInventory((prev) => [...prev, {
            id: `${template.shape}_${template.color}_${Math.random().toString(36).substring(2, 8)}`,
            shape: template.shape,
            color: template.color,
            displayName: template.displayName,
            effects: ['None', 'None'],
            effectValues: [defaultDoubleBase, defaultDoubleBase]
        }]);
    };

    const updateItemEffect = (item: InventoryItem, effectIndex: 0 | 1, newEffect: ItemEffect) => {
        const base = getBaseStats(item);
        const maxPositiveBase = Math.max(
            base.Performance > 0 ? base.Performance : 0,
            base.Quality > 0 ? base.Quality : 0,
            base.Efficiency > 0 ? base.Efficiency : 0
        );
        const defaultDoubleBase = maxPositiveBase * 2;

        setInventory(prev => prev.map(invItem => {
            if (invItem.id === item.id) {
                const updatedEffects: [ItemEffect, ItemEffect] = [...invItem.effects] as [ItemEffect, ItemEffect];
                updatedEffects[effectIndex] = newEffect;

                const updatedValues: [number, number] = [...invItem.effectValues] as [number, number];
                if (newEffect === 'Learning Algorithm') {
                    updatedValues[effectIndex] = defaultDoubleBase;
                } else if (newEffect === 'Degrading') {
                    updatedValues[effectIndex] = maxPositiveBase;
                }

                return { ...invItem, effects: updatedEffects, effectValues: updatedValues };
            }
            return invItem;
        }));
    };

    const updateItemEffectValue = (itemId: string, effectIndex: 0 | 1, newValue: number) => {
        setInventory(prev => prev.map(item => {
            if (item.id === itemId) {
                const updatedValues: [number, number] = [...item.effectValues] as [number, number];
                updatedValues[effectIndex] = newValue;
                return { ...item, effectValues: updatedValues };
            }
            return item;
        }));
    };

    const handleBlurEffectValue = (item: InventoryItem, effectIndex: 0 | 1, rawValue: number) => {
        const base = getBaseStats(item);
        const maxPositiveBase = Math.max(
            base.Performance > 0 ? base.Performance : 0,
            base.Quality > 0 ? base.Quality : 0,
            base.Efficiency > 0 ? base.Efficiency : 0
        );
        const maxLimit = maxPositiveBase * 2;
        const minLimit = 0;

        const val = isNaN(rawValue) ? minLimit : rawValue;
        const clampedValue = Math.max(minLimit, Math.min(maxLimit, val));

        updateItemEffectValue(item.id, effectIndex, clampedValue);
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

        const bgImages: string[] = [];
        const bgPositions: string[] = [];
        const bgSizes: string[] = [];

        if (isSame(x + 1, y) && isSame(x, y + 1) && !isSame(x + 1, y + 1)) {
            bgImages.push('linear-gradient(90deg, #000, #000)');
            bgPositions.push('bottom right');
            bgSizes.push('2px 2px');
        }
        if (isSame(x - 1, y) && isSame(x, y + 1) && !isSame(x - 1, y + 1)) {
            bgImages.push('linear-gradient(90deg, #000, #000)');
            bgPositions.push('bottom left');
            bgSizes.push('2px 2px');
        }
        if (isSame(x + 1, y) && isSame(x, y - 1) && !isSame(x + 1, y - 1)) {
            bgImages.push('linear-gradient(90deg, #000, #000)');
            bgPositions.push('top right');
            bgSizes.push('2px 2px');
        }
        if (isSame(x - 1, y) && isSame(x, y - 1) && !isSame(x - 1, y - 1)) {
            bgImages.push('linear-gradient(90deg, #000, #000)');
            bgPositions.push('top left');
            bgSizes.push('2px 2px');
        }

        return {
            backgroundColor: bgColor,
            border: 'none',
            boxShadow: shadows.join(', ') || 'none',
            backgroundImage: bgImages.length ? bgImages.join(', ') : 'none',
            backgroundPosition: bgPositions.length ? bgPositions.join(', ') : '0 0',
            backgroundSize: bgSizes.length ? bgSizes.join(', ') : 'auto',
            backgroundRepeat: bgImages.length ? 'no-repeat' : 'repeat'
        };
    };

    const filteredModules = MODULE_TEMPLATES.filter(m => {
        if (m.shapeType === 'Node') return false;
        if (filterGroup !== 'All' && m.group !== filterGroup) return false;
        return !(filterSize !== 'All' && m.size !== filterSize);

    });

    const shouldPushNodeToEnd = filterGroup !== 'All';

    const catalogDisplayList = shouldPushNodeToEnd
        ? [...filteredModules, NODE_TEMPLATE]
        : [NODE_TEMPLATE, ...filteredModules];

    return (
        <div className="main-container">

            <style>
                {`
                .catalog-card {
                    transition: transform 0.1s ease-in-out, box-shadow 0.1s ease-in-out, background-color 0.1s ease-in-out;
                }
                .catalog-card:hover {
                    transform: translateY(-2px);
                    background-color: #2a2a2a !important;
                    box-shadow: 0 4px 12px rgba(255, 255, 255, 0.05);
                }
                .catalog-card:active {
                    transform: translateY(0);
                }
                input[type=number]::-webkit-inner-spin-button, 
                input[type=number]::-webkit-outer-spin-button { 
                    -webkit-appearance: none; 
                    margin: 0; 
                }
                input[type=number] { 
                    -moz-appearance: textfield; 
                }
                
                /* Layout Classes */
                .main-container {
                    display: flex;
                    flex-direction: column;
                    min-height: 100vh;
                    background-color: #111;
                    color: #eee;
                    font-family: sans-serif;
                    padding: 20px;
                }
                .stats-header {
                    display: flex;
                    gap: 40px;
                    margin-bottom: 15px;
                    background-color: #1a1a1a;
                    padding: 15px 30px;
                    border-radius: 8px;
                    border: 1px solid #333;
                }
                .grid-wrapper {
                    display: grid;
                    grid-template-columns: repeat(7, 50px);
                    grid-template-rows: repeat(5, 50px);
                    gap: 0px;
                    background-color: #222;
                    padding: 10px;
                    border-radius: 8px;
                    border: 1px solid #333;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                }
                .controls-wrapper {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 15px;
                    margin-top: 10px;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                }
                .solution-ui {
                    display: flex;
                    width: 100%;
                    margin-top: 15px;
                    gap: 10px;
                    justify-content: center;
                    align-items: center;
                }
                .solution-ui input {
                    flex: 1;
                    max-width: 500px;
                    padding: 8px;
                    font-size: 0.8em;
                    background-color: #111;
                    color: #eee;
                    border: 1px solid #444;
                    border-radius: 4px;
                }
                .bottom-layout {
                    display: flex;
                    flex: 1;
                    gap: 30px;
                    min-height: 0;
                }
                
                @media (max-width: 768px) {
                    .main-container {
                        padding: 10px;
                        height: auto;
                    }
                    .bottom-layout {
                        flex-direction: column;
                        gap: 15px;
                        min-height: auto;
                    }
                    .stats-header {
                        gap: 15px;
                        padding: 10px;
                        width: 100%;
                        justify-content: space-around;
                    }
                    .grid-wrapper {
                        transform: scale(0.85);
                        transform-origin: top center;
                        margin-bottom: -25px;
                    }
                    .controls-wrapper {
                        flex-direction: column;
                        width: 100%;
                        align-items: stretch;
                    }
                    .solution-ui {
                        flex-wrap: wrap;
                    }
                    .solution-ui input {
                        max-width: 100%;
                        width: 100%;
                    }
                }
                @media (max-width: 400px) {
                    .grid-wrapper {
                        transform: scale(0.75);
                        margin-bottom: -50px;
                    }
                }
                `}
            </style>

            {/* Tooltip */}
            {hoveredItem && hoverInfo && (
                <div style={{
                    position: 'fixed',
                    top: hoverInfo.y + 15,
                    left: hoverInfo.x + 15,
                    backgroundColor: 'rgba(0, 0, 0, 0.95)',
                    border: `1px solid ${COLOR_MAP[hoveredItem.color]}`,
                    padding: '10px 15px',
                    borderRadius: '6px',
                    zIndex: 1000,
                    pointerEvents: 'none',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    minWidth: '150px'
                }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px', color: COLOR_MAP[hoveredItem.color] }}>
                        {hoveredItem.displayName}
                    </div>
                    {(hoveredItem.effects[0] !== 'None' || hoveredItem.effects[1] !== 'None') && (
                        <div style={{ fontSize: '0.75em', color: '#aaa', fontStyle: 'italic', marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '5px' }}>
                            {hoveredItem.effects.filter(e => e !== 'None').map((e) => {
                                const actualIdx = hoveredItem.effects.indexOf(e as ItemEffect);
                                const val = hoveredItem.effectValues[actualIdx];
                                return `${e}${e === 'Learning Algorithm' || e === 'Degrading' ? ` (${val}%)` : ''}`;
                            }).join(', ')}
                        </div>
                    )}
                    {bestPieceStats.has(hoveredItem.id) ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.9em', marginTop: '5px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#aaa' }}>Perf:</span>
                                <span style={{ color: getStatColor(bestPieceStats.get(hoveredItem.id)!.Performance) }}>{formatStatValue(bestPieceStats.get(hoveredItem.id)!.Performance)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#aaa' }}>Qual:</span>
                                <span style={{ color: getStatColor(bestPieceStats.get(hoveredItem.id)!.Quality) }}>{formatStatValue(bestPieceStats.get(hoveredItem.id)!.Quality)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#aaa' }}>Effic:</span>
                                <span style={{ color: getStatColor(bestPieceStats.get(hoveredItem.id)!.Efficiency) }}>{formatStatValue(bestPieceStats.get(hoveredItem.id)!.Efficiency)}</span>
                            </div>
                        </div>
                    ) : (
                        <div style={{ color: '#888', fontSize: '0.9em' }}>Calculating...</div>
                    )}
                </div>
            )}

            {/* Main Grid & Controls */}
            <div style={{ flex: '0 0 auto', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>

                <div className="stats-header">
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

                <div className="grid-wrapper">
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

                <div style={{ minHeight: '22px', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {warningMsg && (
                        <span style={{ color: '#ff4d4d', fontSize: '0.8em', textAlign: 'center' }}>
                            ⚠ {warningMsg}
                        </span>
                    )}
                </div>

                <div className="controls-wrapper">
                    <div style={{ display: 'flex', gap: '5px', backgroundColor: '#222', padding: '5px', borderRadius: '6px' }}>
                        {[1, 2, 3].map((t) => (
                            <button key={t} onClick={() => handleTierChange(t as GridTier)} disabled={isSolving} style={{ padding: '8px 16px', backgroundColor: tier === t ? '#555' : 'transparent', color: 'white', border: 'none', borderRadius: '4px', cursor: isSolving ? 'not-allowed' : 'pointer' }}>
                                Tier {t}
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: '10px', backgroundColor: '#222', padding: '8px 12px', borderRadius: '6px', border: '1px solid #333', justifyContent: 'center', alignItems: 'center' }}>
                        {(['Performance', 'Quality', 'Efficiency'] as const).map((stat) => (
                            <div key={stat} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '0 10px', borderRight: stat !== 'Efficiency' ? '1px solid #444' : 'none' }}>
                                <span style={{ fontSize: '0.7em', color: '#aaa', textTransform: 'uppercase', fontWeight: 'bold', textAlign: 'center' }}>{stat}</span>
                                <label style={{ fontSize: '0.75em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={maximizeStats[stat]}
                                        onChange={() => handleMaximizeToggle(stat)}
                                        disabled={isSolving}
                                        style={{ margin: 0, cursor: isSolving ? 'not-allowed' : 'pointer' }}
                                    /> Maximize
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                    <span style={{ fontSize: '0.7em', color: '#888' }}>Target:</span>
                                    <input
                                        type="number"
                                        value={targetStats[stat] ?? ''}
                                        onChange={(e) => handleTargetChange(stat, e.target.value === '' ? null : Number(e.target.value))}
                                        disabled={isSolving}
                                        style={{ width: '45px', padding: '2px', fontSize: '0.75em', backgroundColor: '#111', color: '#eee', border: '1px solid #444', borderRadius: '3px', textAlign: 'center' }}
                                    />
                                    <span style={{ fontSize: '0.7em', color: '#888' }}>%</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={resetBoard}
                        style={{ padding: '10px 16px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '6px', cursor: 'pointer' }}
                    >
                        Clear
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

                {/* Solution Code UI */}
                <div className="solution-ui">
                    <span style={{ fontSize: '0.8em', color: '#888' }}>Solution Code:</span>
                    <input
                        type="text"
                        value={solutionCode}
                        onChange={(e) => setSolutionCode(e.target.value)}
                        placeholder="Paste an exported solution code here to import..."
                        disabled={isSolving}
                    />
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={() => importSolution(solutionCode)}
                            disabled={!solutionCode || isSolving}
                            style={{ padding: '8px 16px', fontSize: '0.8em', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', cursor: (!solutionCode || isSolving) ? 'not-allowed' : 'pointer' }}
                        >
                            Import
                        </button>
                        <button
                            onClick={() => navigator.clipboard.writeText(solutionCode)}
                            disabled={!solutionCode}
                            style={{ padding: '8px 16px', fontSize: '0.8em', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', cursor: !solutionCode ? 'not-allowed' : 'pointer' }}
                        >
                            Copy
                        </button>
                    </div>
                </div>
            </div>

            {/* Catalog & Inventory */}
            <div className="bottom-layout">

                {/* Catalog */}
                <div style={{ flex: '2', backgroundColor: '#1a1a1a', padding: '20px', borderRadius: '8px', display: 'flex', flexDirection: 'column' }}>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px solid #333' }}>
                        <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value as FilterGroup)} style={{ flex: 1, minWidth: '150px', padding: '8px 12px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', outline: 'none' }}>
                            <option value="All">All Module Groups</option>
                            <option value="Performance">Performance (Red)</option>
                            <option value="Quality">Quality (Yellow)</option>
                            <option value="Efficiency">Efficiency (Green)</option>
                            <option value="Special">Special Modules</option>
                        </select>
                        <select value={filterSize} onChange={(e) => setFilterSize(e.target.value === 'All' ? 'All' : Number(e.target.value) as any)} style={{ flex: 1, minWidth: '150px', padding: '8px 12px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', outline: 'none' }}>
                            <option value="All">All Sizes</option>
                            <option value={3}>Size 3</option>
                            <option value={4}>Size 4</option>
                            <option value={5}>Size 5</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', overflowY: 'auto', alignContent: 'flex-start', padding: '5px 5px 20px 5px', justifyContent: 'center' }}>
                        {catalogDisplayList.map((template, idx) => {
                            const uniqueKey = `${template.shape}_${template.color}_${idx}`;

                            return (
                                <div
                                    key={uniqueKey}
                                    className="catalog-card"
                                    onClick={() => addPieceToInventory(template)}
                                    style={{
                                        padding: '16px 12px',
                                        width: '135px',
                                        backgroundColor: '#222',
                                        border: `1px solid ${COLOR_MAP[template.color]}`,
                                        borderRadius: '6px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <div style={{ height: '50px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                            <MiniShape shape={template.shape} colorHex={COLOR_MAP[template.color]} />
                                        </div>
                                        <span style={{ fontSize: '0.7em', color: '#ccc', marginTop: '15px', textAlign: 'center', fontWeight: 'bold' }}>
                                            {template.displayName}
                                        </span>
                                        <span style={{ fontSize: '0.65em', color: '#777', marginTop: '6px', textAlign: 'center' }}>
                                            {template.shape === 'Node1x2' ? 'Node' : `${template.shapeType} - Size ${template.size}`}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Inventory */}
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                                    <MiniShape shape={item.shape} colorHex={COLOR_MAP[item.color]} size="10px" />

                                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '4px' }}>
                                        <span style={{ fontSize: '0.9em', fontWeight: 'bold' }}>{item.displayName}</span>

                                        {item.shape !== 'Node1x2' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                                                {[0, 1].map((effectIdx) => {
                                                    const currentEffect = item.effects[effectIdx];
                                                    const showCustomInput = currentEffect === 'Learning Algorithm' || currentEffect === 'Degrading';

                                                    return (
                                                        <div key={effectIdx} style={{ display: 'flex', gap: '6px', alignItems: 'center', width: '100%' }}>
                                                            <select
                                                                value={currentEffect}
                                                                onChange={(e) => updateItemEffect(item, effectIdx as 0 | 1, e.target.value as ItemEffect)}
                                                                style={{ flex: 1, padding: '2px', fontSize: '0.7em', backgroundColor: '#111', color: '#eee', border: '1px solid #444', borderRadius: '3px', minWidth: '0' }}
                                                            >
                                                                {EFFECTS_LIST.filter(eff => eff === 'None' || eff !== item.effects[effectIdx === 0 ? 1 : 0]).map(eff => (
                                                                    <option key={eff} value={eff}>{eff === 'None' ? 'No Effect' : eff}</option>
                                                                ))}
                                                            </select>

                                                            {showCustomInput && (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }} title="Custom Percentage Value">
                                                                    <input
                                                                        type="number"
                                                                        value={item.effectValues[effectIdx]}
                                                                        onChange={(e) => updateItemEffectValue(item.id, effectIdx as 0 | 1, Number(e.target.value))}
                                                                        onBlur={(e) => handleBlurEffectValue(item, effectIdx as 0 | 1, Number(e.target.value))}
                                                                        style={{ width: '48px', padding: '1px', fontSize: '0.7em', backgroundColor: '#111', color: '#eee', border: '1px solid #444', borderRadius: '3px', textAlign: 'center' }}
                                                                    />
                                                                    <span style={{ fontSize: '0.65em', color: '#aaa' }}>%</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setInventory(prev => prev.filter(i => i.id !== item.id))}
                                    disabled={isSolving}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: isSolving ? '#444' : '#666',
                                        cursor: isSolving ? 'not-allowed' : 'pointer',
                                        fontSize: '1.2em',
                                        marginLeft: '10px'
                                    }}
                                >
                                    &times;
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}