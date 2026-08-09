import React, { useState } from 'react';
import type {Goal, GridTier, InventoryItem, FilterGroup, ItemEffect, ModuleTemplate, ModuleColor} from './types';
import { COLOR_MAP, EFFECTS_LIST, MODULE_TEMPLATES, NODE_TEMPLATE } from './constants';
import { formatStatValue, getStatColor } from './utils';
import { useOptimizer } from './hooks/useOptimizer';
import MiniShape from './components/MiniShape';

export default function ModuleInventoryUI() {
    const {
        tier, handleTierChange,
        goal, setGoal, setWarningMsg,
        inventory, setInventory,
        board, bestTotals, bestPieceStats,
        isSolving, warningMsg,
        runOptimization, resetBoard
    } = useOptimizer();

    const [filterGroup, setFilterGroup] = useState<FilterGroup>('All');
    const [filterSize, setFilterSize] = useState<'All' | 3 | 4 | 5>('All');
    const [hoverInfo, setHoverInfo] = useState<{ x: number, y: number, cell: InventoryItem } | null>(null);

    const addPieceToInventory = (template: ModuleTemplate) => {
        setInventory((prev) => [...prev, {
            id: `${template.shape}_${template.color}_${Math.random().toString(36).substring(2, 8)}`,
            shape: template.shape,
            color: template.color,
            displayName: template.displayName,
            effects: ['None', 'None']
        }]);
    };

    const updateItemEffect = (itemId: string, effectIndex: 0 | 1, newEffect: ItemEffect) => {
        setInventory(prev => prev.map(item => {
            if (item.id === itemId) {
                const updatedEffects: [ItemEffect, ItemEffect] = [...item.effects] as [ItemEffect, ItemEffect];
                updatedEffects[effectIndex] = newEffect;
                return { ...item, effects: updatedEffects };
            }
            return item;
        }));
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
        if (filterSize !== 'All' && m.size !== filterSize) return false;
        return true;
    });

    const shouldPushNodeToEnd = filterGroup !== 'All';

    const catalogDisplayList = shouldPushNodeToEnd
        ? [...filteredModules, NODE_TEMPLATE]
        : [NODE_TEMPLATE, ...filteredModules];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#111', color: '#eee', fontFamily: 'sans-serif', padding: '20px' }}>

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
        `}
            </style>

            {/* Tooltip */}
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
                    <div style={{ fontWeight: 'bold', marginBottom: '4px', color: COLOR_MAP[hoverInfo.cell.color] }}>
                        {hoverInfo.cell.displayName}
                    </div>
                    {(hoverInfo.cell.effects[0] !== 'None' || hoverInfo.cell.effects[1] !== 'None') && (
                        <div style={{ fontSize: '0.75em', color: '#aaa', fontStyle: 'italic', marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '5px' }}>
                            {hoverInfo.cell.effects.filter(e => e !== 'None').map(e => `+ ${e}`).join('\n')}
                        </div>
                    )}
                    {bestPieceStats.has(hoverInfo.cell.id) ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.9em', marginTop: '5px' }}>
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

            {/* TOP: Main Grid & Controls */}
            <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>

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

                <div style={{ minHeight: '22px', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {warningMsg && (
                        <span style={{ color: '#ff4d4d', fontSize: '0.8em' }}>
              ⚠ {warningMsg}
            </span>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '15px', marginTop: '10px', alignItems: 'center' }}>
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
                        style={{ padding: '10px 16px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '6px', cursor: 'pointer' }}
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

            {/* BOTTOM: Catalog & Inventory */}
            <div style={{ display: 'flex', flex: '1', gap: '30px', minHeight: 0 }}>

                {/* Catalog */}
                <div style={{ flex: '2', backgroundColor: '#1a1a1a', padding: '20px', borderRadius: '8px', display: 'flex', flexDirection: 'column' }}>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px solid #333' }}>
                        <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value as FilterGroup)} style={{ padding: '8px 12px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', outline: 'none' }}>
                            <option value="All">All Module Groups</option>
                            <option value="Performance">Performance (Red)</option>
                            <option value="Quality">Quality (Yellow)</option>
                            <option value="Efficiency">Efficiency (Green)</option>
                            <option value="Special">Special Modules</option>
                        </select>
                        <select value={filterSize} onChange={(e) => setFilterSize(e.target.value === 'All' ? 'All' : Number(e.target.value) as any)} style={{ padding: '8px 12px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', outline: 'none' }}>
                            <option value="All">All Sizes</option>
                            <option value={3}>Area of 3</option>
                            <option value={4}>Area of 4</option>
                            <option value={5}>Area of 5</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', overflowY: 'auto', alignContent: 'flex-start', padding: '5px 5px 20px 5px' }}>
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

                {/* Right Panel: Inventory */}
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
                                            <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                                                <select
                                                    value={item.effects[0]}
                                                    onChange={(e) => updateItemEffect(item.id, 0, e.target.value as ItemEffect)}
                                                    style={{ flex: 1, padding: '2px', fontSize: '0.7em', backgroundColor: '#111', color: '#eee', border: '1px solid #444', borderRadius: '3px' }}
                                                >
                                                    {EFFECTS_LIST.filter(eff => eff === 'None' || eff !== item.effects[1]).map(eff => (
                                                        <option key={eff} value={eff}>{eff === 'None' ? 'No Effect' : eff}</option>
                                                    ))}
                                                </select>
                                                <select
                                                    value={item.effects[1]}
                                                    onChange={(e) => updateItemEffect(item.id, 1, e.target.value as ItemEffect)}
                                                    style={{ flex: 1, padding: '2px', fontSize: '0.7em', backgroundColor: '#111', color: '#eee', border: '1px solid #444', borderRadius: '3px' }}
                                                >
                                                    {EFFECTS_LIST.filter(eff => eff === 'None' || eff !== item.effects[0]).map(eff => (
                                                        <option key={eff} value={eff}>{eff === 'None' ? 'No Effect' : eff}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button onClick={() => setInventory(prev => prev.filter(i => i.id !== item.id))} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '1.2em', marginLeft: '10px' }}>&times;</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}