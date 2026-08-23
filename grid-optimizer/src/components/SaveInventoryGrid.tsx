import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { InventoryItem } from '../types';
import { inferMachinePanes } from '../saveImport';
import type { ImportedGridItem, ImportedInventoryGrid } from '../saveImport';
import { COLOR_MAP } from '../constants';
import { getMachineAbbreviation, getModuleLabel, getModuleLabelArea } from '../moduleRules';
import type { MoveStep } from '../movePlan';

const CELL = 40;
const MIN_LABEL_SIZE = 11;

function AutoFitLabel({ text, vertical, maxSize, area, bottomInset = 0 }: {
    text: string;
    vertical: boolean;
    maxSize: number;
    area: { x: number; y: number; width: number; height: number };
    bottomInset?: number;
}) {
    const boxRef = useRef<HTMLSpanElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);

    useLayoutEffect(() => {
        const box = boxRef.current;
        const element = textRef.current;
        if (!box || !element) return;
        element.style.overflow = 'visible';
        element.style.whiteSpace = 'normal';
        element.style.textOverflow = 'clip';
        for (let size = maxSize; size >= MIN_LABEL_SIZE; size--) {
            element.style.fontSize = `${size}px`;
            if (element.scrollWidth <= box.clientWidth + 1 && element.scrollHeight <= box.clientHeight + 1) return;
        }
        element.style.overflow = 'hidden';
        element.style.whiteSpace = 'nowrap';
        element.style.textOverflow = 'ellipsis';
    }, [area.height, area.width, bottomInset, maxSize, text, vertical]);

    return <span ref={boxRef} style={{
        position: 'absolute',
        left: area.x * CELL + 4,
        top: area.y * CELL + 4,
        width: area.width * CELL - 8,
        height: area.height * CELL - 8 - bottomInset,
        zIndex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none'
    }}>
        <span ref={textRef} style={{
            display: 'block',
            width: vertical ? 'auto' : '100%',
            height: vertical ? '100%' : 'auto',
            maxWidth: '100%',
            maxHeight: '100%',
            overflow: 'visible',
            textAlign: 'center',
            overflowWrap: 'normal',
            wordBreak: 'normal',
            writingMode: vertical ? 'vertical-rl' : 'horizontal-tb',
            textOrientation: 'mixed',
            fontSize: `${maxSize}px`,
            fontWeight: 'bold',
            color: '#fff',
            lineHeight: 1.1,
            textShadow: '0 1px 3px #000, 0 1px 3px #000'
        }}>{text}</span>
    </span>;
}

const MACHINE_PANES: Record<string, { node: number; label: string; width: number; height: number }[]> = {
    water_purifier: [
        { node: 2, label: 'Power Source', width: 1, height: 2 }, { node: 3, label: 'Modules', width: 7, height: 5 },
        { node: 4, label: 'Water Container', width: 4, height: 4 }
    ],
    furnace: [
        { node: 2, label: 'Power Source', width: 1, height: 2 }, { node: 3, label: 'Modules', width: 7, height: 5 },
        { node: 4, label: 'Input', width: 9, height: 5 }, { node: 5, label: 'Output', width: 9, height: 5 }
    ],
    moisture_farm: [
        { node: 2, label: 'Power Source', width: 1, height: 2 }, { node: 3, label: 'Modules', width: 7, height: 5 },
        { node: 4, label: 'Water Container', width: 4, height: 4 }
    ],
    security_alarm: [
        { node: 2, label: 'Power Source', width: 1, height: 2 }, { node: 3, label: 'Modules', width: 7, height: 5 }
    ]
};

const lockedModuleCells = (tier?: number) => {
    const cells: { x: number; y: number }[] = [];
    if ((tier || 1) < 3) cells.push({ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 4 }, { x: 6, y: 4 });
    if ((tier || 1) === 1) cells.push({ x: 3, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 3 });
    return cells;
};

function labelArea(cells: { x: number; y: number }[], width: number, height: number) {
    if (cells.length === width * height) return { x: 0, y: 0, width, height };
    const occupied = new Set(cells.map(cell => `${cell.x},${cell.y}`));
    let best = { x: cells[0].x, y: cells[0].y, width: 1, height: 1 };
    const preferVertical = height > width;
    const consider = (candidate: typeof best) => {
        const length = candidate.width * candidate.height;
        const bestLength = best.width * best.height;
        if (length > bestLength || (length === bestLength && preferVertical && candidate.height > best.height)) best = candidate;
    };
    cells.forEach(cell => {
        if (!occupied.has(`${cell.x - 1},${cell.y}`)) {
            let run = 1;
            while (occupied.has(`${cell.x + run},${cell.y}`)) run++;
            consider({ x: cell.x, y: cell.y, width: run, height: 1 });
        }
        if (!occupied.has(`${cell.x},${cell.y - 1}`)) {
            let run = 1;
            while (occupied.has(`${cell.x},${cell.y + run}`)) run++;
            consider({ x: cell.x, y: cell.y, width: 1, height: run });
        }
    });
    return best;
}

export default function SaveInventoryGrid({ grid, modules, recycleReasons, moduleDestinations, moduleAssignments, assignmentMachines, locatedModule, guideModuleId, guideLocationId, guideTargetLocationId, guideTargetCells, guideTargetColumns = 7, completedMoves, navigationLocked, onModuleDragStart, onModuleHover, onModuleLeave, onModuleAssignmentChange }: {
    grid: ImportedInventoryGrid;
    modules: InventoryItem[];
    recycleReasons: Map<string, string>;
    moduleDestinations: Map<string, string>;
    moduleAssignments: Record<string, string>;
    assignmentMachines: { id: string; name: string; enabled: boolean }[];
    onModuleDragStart: (event: ReactMouseEvent, module: InventoryItem, offsets: { x: number; y: number }[]) => void;
    locatedModule: InventoryItem | null;
    guideModuleId?: string;
    guideLocationId?: string;
    guideTargetLocationId?: string;
    guideTargetCells?: number[];
    guideTargetColumns?: number;
    completedMoves: MoveStep[];
    navigationLocked: boolean;
    onModuleHover: (module: InventoryItem, x: number, y: number, showRecycleReason: boolean) => void;
    onModuleLeave: () => void;
    onModuleAssignmentChange: (moduleId: string, target: string) => void;
}) {
    const byId = useMemo(() => new Map(grid.items.map(item => [item.id, item])), [grid]);
    const [navigation, setNavigation] = useState({ grid, id: grid.rootId });
    const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
    const selectedId = navigation.grid === grid ? navigation.id : grid.rootId;
    const guideContainerId = guideLocationId?.replace(/^save_machine_/, '');
    const currentId = guideContainerId && byId.has(guideContainerId) ? guideContainerId : selectedId;
    const setCurrentId = (id: string) => setNavigation({ grid, id });
    const panelsRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        panelsRef.current?.scrollTo({ left: panelsRef.current.scrollWidth, behavior: 'smooth' });
    }, [currentId]);
    const moduleById = new Map(modules.map(module => [module.id, module]));
    const selectedModule = selectedModuleId ? moduleById.get(selectedModuleId) : undefined;
    const originalModuleItems = new Map(grid.items.flatMap(item => item.moduleId ? [[item.moduleId, item] as const] : []));
    const virtualMoves = new Map(completedMoves.map(move => [move.moduleId, move]));

    const path: ImportedGridItem[] = [];
    let cursor = byId.get(currentId);
    const pathSeen = new Set<string>();
    while (cursor && !pathSeen.has(cursor.id)) {
        pathSeen.add(cursor.id);
        path.unshift(cursor);
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    const sourceContainer = guideLocationId ? byId.get(guideLocationId.replace(/^save_machine_/, '')) : undefined;
    const targetContainer = guideTargetLocationId ? byId.get(guideTargetLocationId.replace(/^save_machine_/, '')) : undefined;
    const targetPath: ImportedGridItem[] = [];
    cursor = targetContainer;
    const targetPathSeen = new Set<string>();
    while (cursor && !targetPathSeen.has(cursor.id)) {
        targetPathSeen.add(cursor.id);
        targetPath.unshift(cursor);
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    let commonPathLength = 0;
    while (commonPathLength < Math.min(path.length, targetPath.length) && path[commonPathLength].id === targetPath[commonPathLength].id) commonPathLength++;
    const splitGuidePaths = Boolean(sourceContainer && targetContainer && commonPathLength < Math.min(path.length, targetPath.length));
    const panelContainers = splitGuidePaths
        ? [...path, ...targetPath.slice(commonPathLength)]
        : targetPath.length > path.length ? targetPath : path;
    const guideDepth = Math.max(path.length, targetPath.length);

    const containsLocatedModule = (itemId: string) => {
        let parentId = locatedModule?.source?.parentId || null;
        const seen = new Set<string>();
        while (parentId && !seen.has(parentId)) {
            seen.add(parentId);
            if (parentId === itemId) return true;
            parentId = byId.get(parentId)?.parentId || null;
        }
        return false;
    };
    const containsTargetContainer = (itemId: string) => {
        let targetId = targetContainer?.id || null;
        const seen = new Set<string>();
        while (targetId && !seen.has(targetId)) {
            seen.add(targetId);
            if (targetId === itemId) return true;
            targetId = byId.get(targetId)?.parentId || null;
        }
        return false;
    };

    return (
        <div style={{ minWidth: 0, backgroundColor: '#1c1c1e', padding: '20px', marginTop: '20px', borderRadius: '8px', border: '1px solid #2c2c2e' }}>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                <strong style={{ marginRight: '5px' }}>Save inventory</strong>
                {path.map((item, index) => (
                    <span key={item.id}>
                        {index > 0 && <span style={{ color: '#666', marginRight: '5px' }}>→</span>}
                        <button disabled={navigationLocked} onClick={() => setCurrentId(item.id)} style={{ padding: 0, border: 0, background: 'none', color: index === path.length - 1 ? '#eee' : '#8ab4f8', cursor: navigationLocked ? 'default' : 'pointer', opacity: 1 }}>{item.name}</button>
                    </span>
                ))}
                {locatedModule && <span style={{ marginLeft: 'auto', color: '#aaa', fontSize: '0.8em' }}>Locating: {locatedModule.displayName}</span>}
            </div>
            <div style={{ color: '#888', fontSize: '0.75em', margin: '-6px 0 12px' }}>
                Tip: Click a module inside a machine to highlight its location in Shop Inventory.
                <div style={{ color: '#8ab4f8', marginTop: '3px' }}>After optimizing, assigned modules show a blue destination badge, such as MF#1 for Moisture Farm #1.</div>
                {recycleReasons.size > 0 && <div style={{ color: '#a97852', marginTop: '3px' }}>Run the optimizer before removing modules. Brown modules may be worth selling or exchanging. Ruined modules can be sold or dismantled. Hover for details.</div>}
            </div>
            {selectedModule && <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '-4px 0 12px', color: '#ccc', fontSize: '0.85em' }}>
                Use <strong>{selectedModule.displayName}</strong>:
                <select
                    value={moduleAssignments[selectedModule.id] || ''}
                    disabled={navigationLocked}
                    onChange={event => onModuleAssignmentChange(selectedModule.id, event.target.value)}
                    style={{ padding: '5px 8px', backgroundColor: '#292929', color: '#eee', border: '1px solid #555', borderRadius: '4px' }}
                >
                    <option value="">Anywhere</option>
                    <option value="__reserved__">Keep out of optimization</option>
                    {assignmentMachines.map(machine => <option key={machine.id} value={machine.id} disabled={!machine.enabled}>{machine.name}{machine.enabled ? '' : ' (not optimizing)'}</option>)}
                </select>
            </label>}
            <div ref={panelsRef} style={{
                overflow: 'auto', maxWidth: '100%', display: splitGuidePaths ? 'grid' : 'flex', alignItems: 'flex-start', gap: '20px',
                gridAutoColumns: splitGuidePaths ? 'max-content' : undefined
            }}>
                {panelContainers.map(container => {
                    const allChildren = grid.items.filter(item => item.parentId === container.id && (!item.moduleId || !virtualMoves.has(item.moduleId)));
                    virtualMoves.forEach(move => {
                        if (move.toId.replace(/^save_machine_/, '') !== container.id || move.targetCells.length === 0) return;
                        const original = originalModuleItems.get(move.moduleId);
                        if (!original) return;
                        const points = move.targetCells.map(cell => ({ x: cell % move.targetColumns, y: Math.floor(cell / move.targetColumns) }));
                        const minX = Math.min(...points.map(point => point.x));
                        const minY = Math.min(...points.map(point => point.y));
                        allChildren.push({
                            ...original,
                            id: `virtual-${move.moduleId}`,
                            parentId: container.id,
                            inventoryNode: container.machine ? 3 : undefined,
                            x: minX,
                            y: minY,
                            width: Math.max(...points.map(point => point.x)) - minX + 1,
                            height: Math.max(...points.map(point => point.y)) - minY + 1,
                            cells: points.map(point => ({ x: point.x - minX, y: point.y - minY }))
                        });
                    });
                    const panes = container.machine
                        ? MACHINE_PANES[container.identifier] || inferMachinePanes(allChildren)
                        : [{ node: -1, label: '', width: container.inventoryWidth || Math.max(1, ...allChildren.map(item => item.x + item.width)), height: container.inventoryHeight || Math.max(1, ...allChildren.map(item => item.y + item.height)) }];
                    const sourcePathIndex = path.findIndex(item => item.id === container.id);
                    const targetPathIndex = targetPath.findIndex(item => item.id === container.id);
                    const sharedPanel = sourcePathIndex >= 0 && sourcePathIndex < commonPathLength;
                    const endpointPanel = container.id === sourceContainer?.id || container.id === targetContainer?.id;
                    const guideColumn = sharedPanel
                        ? sourcePathIndex + 1
                        : sourcePathIndex >= commonPathLength
                            ? guideDepth - (path.length - sourcePathIndex) + 1
                            : guideDepth - (targetPath.length - targetPathIndex) + 1;
                    return <div key={container.id} style={{
                        flex: '0 0 auto',
                        gridColumn: splitGuidePaths ? guideColumn : undefined,
                        gridRow: splitGuidePaths ? (endpointPanel ? (container.id === sourceContainer?.id ? 1 : 2) : '1 / span 2') : undefined
                    }}>
                        <div style={{ color: '#bbb', fontWeight: 'bold', fontSize: '0.85em', marginBottom: '6px' }}>{container.name}</div>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        {panes.map(pane => {
                            const children = pane.node === -1 ? allChildren : allChildren.filter(item => item.inventoryNode === pane.node);
                            const dimensionChildren = container.identifier === 'furnace' && (pane.node === 4 || pane.node === 5)
                                ? allChildren.filter(item => item.inventoryNode === 4 || item.inventoryNode === 5)
                                : children;
                            const paneWidth = Math.max(pane.width, ...dimensionChildren.map(item => item.x + item.width));
                            const paneHeight = Math.max(pane.height, ...dimensionChildren.map(item => item.y + item.height));
                            return <div key={pane.node}>
                            {pane.label && <div style={{ color: '#999', fontSize: '0.75em', textAlign: 'center', marginBottom: '4px' }}>{pane.label}</div>}
                        <div style={{
                            position: 'relative',
                            width: paneWidth * CELL,
                            height: paneHeight * CELL,
                            backgroundColor: '#2a2a2a',
                            backgroundImage: 'linear-gradient(#000 0 2px, transparent 2px 38px, #000 38px 40px), linear-gradient(90deg, #000 0 2px, transparent 2px 38px, #000 38px 40px)',
                            backgroundSize: `${CELL}px ${CELL}px`,
                            border: '2px solid #000',
                            boxSizing: 'content-box'
                        }}>
                        {pane.node === 3 && lockedModuleCells(container.tier).map(cell => (
                            <span key={`locked-${cell.x}-${cell.y}`} style={{ position: 'absolute', left: cell.x * CELL, top: cell.y * CELL, width: CELL, height: CELL, backgroundColor: '#111' }} />
                        ))}
                        {children.map(item => {
                        const module = item.moduleId ? moduleById.get(item.moduleId) : undefined;
                        const recycleReason = module && !container.machine ? recycleReasons.get(module.id) : undefined;
                        const destination = module ? moduleDestinations.get(module.id) : undefined;
                        const itemLabel = item.name.replace(/([a-z])([A-Z])/g, '$1 $2');
                        const labelText = module ? getModuleLabel(module.displayName) : itemLabel;
                        const showDestination = destination && labelText !== 'Node';
                        const targetHighlighted = Boolean(item.container && containsTargetContainer(item.id));
                        const highlighted = targetHighlighted || Boolean((item.moduleId && (item.moduleId === locatedModule?.id || item.moduleId === guideModuleId)) || containsLocatedModule(item.id));
                        const highlightColor = targetHighlighted ? '#57e389' : '#00ffff';
                        const occupied = new Set(item.cells.map(cell => `${cell.x},${cell.y}`));
                        const label = module ? getModuleLabelArea(item.cells) : labelArea(item.cells, item.width, item.height);
                        const verticalLabel = label.width === 1 && label.height > 1;
                        const labelSize = module ? 20 : label.width >= 2 && label.height >= 2 ? 20 : 18;
                        return (
                            <button
                                key={item.id}
                                onClick={() => {
                                    if (navigationLocked) return;
                                    if (module) setSelectedModuleId(module.id);
                                    else if (item.container) setCurrentId(item.id);
                                }}
                                onMouseDown={(event) => {
                                    if (!module || navigationLocked) return;
                                    const minX = Math.min(...item.cells.map(cell => cell.x));
                                    const minY = Math.min(...item.cells.map(cell => cell.y));
                                    onModuleDragStart(event, module, item.cells.map(cell => ({ x: cell.x - minX, y: cell.y - minY })));
                                }}
                                onMouseMove={(event) => module && onModuleHover(module, event.clientX, event.clientY, !container.machine)}
                                onMouseLeave={() => module && onModuleLeave()}
                                aria-label={`${item.name}${item.container && !navigationLocked ? ' — open' : ''}`}
                                title={module ? undefined : item.name}
                                style={{
                                    position: 'absolute', left: item.x * CELL, top: item.y * CELL,
                                    width: item.width * CELL, height: item.height * CELL,
                                    overflow: 'visible', padding: 0, boxSizing: 'border-box',
                                    color: '#eee', fontSize: '0.72em', lineHeight: 1.1,
                                    background: 'transparent', border: 0,
                                    filter: highlighted ? `brightness(1.15) drop-shadow(0 0 9px ${highlightColor})` : 'none',
                                    cursor: module && !navigationLocked ? 'grab' : item.container && !navigationLocked ? 'pointer' : 'default'
                                }}
                            >
                                {item.cells.map((cell, index) => {
                                    const edge = highlighted ? highlightColor : '#000';
                                    const size = highlighted ? 4 : 2;
                                    const shadows = [];
                                    if (!occupied.has(`${cell.x},${cell.y - 1}`)) shadows.push(`inset 0 ${size}px 0 ${edge}`);
                                    if (!occupied.has(`${cell.x},${cell.y + 1}`)) shadows.push(`inset 0 -${size}px 0 ${edge}`);
                                    if (!occupied.has(`${cell.x - 1},${cell.y}`)) shadows.push(`inset ${size}px 0 0 ${edge}`);
                                    if (!occupied.has(`${cell.x + 1},${cell.y}`)) shadows.push(`inset -${size}px 0 0 ${edge}`);
                                    const cornerPositions = [];
                                    if (occupied.has(`${cell.x + 1},${cell.y}`) && occupied.has(`${cell.x},${cell.y + 1}`) && !occupied.has(`${cell.x + 1},${cell.y + 1}`)) cornerPositions.push('bottom right');
                                    if (occupied.has(`${cell.x - 1},${cell.y}`) && occupied.has(`${cell.x},${cell.y + 1}`) && !occupied.has(`${cell.x - 1},${cell.y + 1}`)) cornerPositions.push('bottom left');
                                    if (occupied.has(`${cell.x + 1},${cell.y}`) && occupied.has(`${cell.x},${cell.y - 1}`) && !occupied.has(`${cell.x + 1},${cell.y - 1}`)) cornerPositions.push('top right');
                                    if (occupied.has(`${cell.x - 1},${cell.y}`) && occupied.has(`${cell.x},${cell.y - 1}`) && !occupied.has(`${cell.x - 1},${cell.y - 1}`)) cornerPositions.push('top left');
                                    return <span key={index} style={{
                                        position: 'absolute',
                                        left: cell.x * CELL,
                                        top: cell.y * CELL,
                                        width: CELL,
                                        height: CELL,
                                        boxSizing: 'border-box',
                                        backgroundColor: recycleReason ? '#795548' : module ? COLOR_MAP[module.color] : item.container ? '#394553' : '#33343b',
                                        boxShadow: shadows.join(', '),
                                        backgroundImage: cornerPositions.map(() => `linear-gradient(${edge}, ${edge})`).join(', ') || 'none',
                                        backgroundPosition: cornerPositions.join(', '),
                                        backgroundSize: cornerPositions.map(() => `${size}px ${size}px`).join(', '),
                                        backgroundRepeat: 'no-repeat'
                                    }} />;
                                })}
                                <AutoFitLabel text={labelText} vertical={verticalLabel} maxSize={labelSize} area={label} bottomInset={showDestination ? 17 : 0} />
                                {showDestination && <span style={{
                                    position: 'absolute',
                                    left: (label.x + label.width / 2) * CELL,
                                    top: (label.y + label.height) * CELL - 20,
                                    transform: 'translateX(-50%)',
                                    width: 'max-content',
                                    maxWidth: label.width * CELL - 4,
                                    height: 16,
                                    zIndex: 2,
                                    overflow: 'hidden',
                                    borderRadius: '3px',
                                    padding: '0 4px',
                                    border: '1px solid #7ec8ff',
                                    backgroundColor: '#075b9b',
                                    color: '#fff',
                                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.8)',
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    lineHeight: '14px',
                                    textAlign: 'center',
                                    whiteSpace: 'nowrap',
                                    pointerEvents: 'none'
                                }}>{getMachineAbbreviation(destination)}</span>}
                            </button>
                        );
                        })}
                        {(pane.node === 3 || pane.node === -1) && targetContainer?.id === container.id && guideTargetCells?.map(cell => (
                            <span key={`guide-target-${cell}`} style={{
                                position: 'absolute',
                                left: (cell % guideTargetColumns) * CELL,
                                top: Math.floor(cell / guideTargetColumns) * CELL,
                                width: CELL,
                                height: CELL,
                                zIndex: 5,
                                boxSizing: 'border-box',
                                border: '3px solid #69f58a',
                                backgroundColor: 'rgba(40, 180, 80, 0.22)',
                                boxShadow: '0 0 6px #69f58a',
                                pointerEvents: 'none'
                            }} />
                        ))}
                        </div>
                        </div>;
                        })}
                        </div>
                    </div>;
                })}
            </div>
        </div>
    );
}
