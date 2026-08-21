'use client';

import { useEffect, useRef, useState } from 'react';
import { Group, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { WarehouseZone, ZonePositionUpdate } from './types';

interface WarehouseMapCanvasProps {
  zones: WarehouseZone[];
  selectedIds: string[];
  highlightedIds?: string[];
  highlightedSlots?: Record<string, number>;
  slotCounts?: Record<string, number>;
  dimUnhighlighted?: boolean;
  readOnly?: boolean;
  onSelectIds: (ids: string[]) => void;
  onDragEnd: (id: string, posX: number, posY: number) => void;
  onBulkDragEnd: (updates: ZonePositionUpdate[]) => void;
  onResize: (
    id: string,
    posX: number,
    posY: number,
    width: number,
    height: number,
  ) => void;
  onEdit: (id: string) => void;
  onZoneClick?: (id: string) => void;
  onSlotHover?: (slot: {
    zoneId: string;
    slotNumber: number;
    clientX: number;
    clientY: number;
  } | null) => void;
  onSlotClick?: (slot: { zoneId: string; slotNumber: number }) => void;
}

const GRID_SIZE = 20;
const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 700;
const MIN_SIZE = 40;

function getZoneSlotCount(zone: WarehouseZone) {
  if (/^[A-F]$/.test(zone.locationCode)) return 6;
  if (['S', 'R', 'L'].includes(zone.locationCode)) return 9;
  if (zone.locationCode === 'N') return zone.floor.includes('ซ้าย') ? 5 : 3;
  return 1;
}

function getRackSlotIndex(zone: WarehouseZone, slotNumber: number, slotCount: number, isVertical: boolean) {
  // ชั้นแนวตั้งเริ่ม Rack 1 จากด้านประตูทางเข้าด้านล่าง แล้วไล่ขึ้นด้านบน
  if (isVertical) return slotCount - slotNumber;
  // โซน N ฝั่งซ้ายเริ่มนับจากขอบขวาที่อยู่ติดช่องประตู
  if (zone.locationCode === 'N' && zone.floor.includes('ซ้าย')) return slotCount - slotNumber;
  return slotNumber - 1;
}

function snapToGrid(value: number) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

export default function WarehouseMapCanvas({
  zones,
  selectedIds,
  highlightedIds = [],
  highlightedSlots = {},
  slotCounts = {},
  dimUnhighlighted = false,
  readOnly = false,
  onSelectIds,
  onDragEnd,
  onBulkDragEnd,
  onResize,
  onEdit,
  onZoneClick,
  onSlotHover,
  onSlotClick,
}: WarehouseMapCanvasProps) {
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageSize, setStageSize] = useState({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
  const [selectionBox, setSelectionBox] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);

  const shapeRefs = useRef<Record<string, Konva.Group>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const isSelecting = useRef(false);
  const draggedZoneStart = useRef<{ x: number; y: number } | null>(null);
  const dragStartPositions = useRef<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;

    if (!readOnly && selectedIds.length === 1) {
      const node = shapeRefs.current[selectedIds[0]];
      if (node) {
        transformer.nodes([node]);
        transformer.getLayer()?.batchDraw();
        return;
      }
    }

    transformer.nodes([]);
    transformer.getLayer()?.batchDraw();
  }, [readOnly, selectedIds, zones]);

  useEffect(() => {
    if (!readOnly || !scrollRef.current) return;
    const container = scrollRef.current;

    const fitToContainer = () => {
      const width = Math.max(container.clientWidth, 320);
      const height = Math.max(container.clientHeight, 300);
      const nextScale = Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT, 1);
      setStageSize({ width, height });
      setScale(nextScale);
      setStagePos({
        x: Math.max((width - CANVAS_WIDTH * nextScale) / 2, 0),
        y: Math.max((height - CANVAS_HEIGHT * nextScale) / 2, 0),
      });
    };

    const frame = window.requestAnimationFrame(fitToContainer);
    const observer = new ResizeObserver(fitToContainer);
    observer.observe(container);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [readOnly]);

  const toStageCoordinates = (stage: Konva.Stage) => {
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;

    return {
      x: (pointer.x - stagePos.x) / scale,
      y: (pointer.y - stagePos.y) / scale,
    };
  };

  const handleWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    const stage = event.target.getStage();
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const pointUnderPointer = {
      x: (pointer.x - stagePos.x) / scale,
      y: (pointer.y - stagePos.y) / scale,
    };
    const scaleFactor = event.evt.deltaY < 0 ? 1.08 : 1 / 1.08;
    const nextScale = Math.min(Math.max(scale * scaleFactor, 0.4), 2.5);

    setScale(nextScale);
    setStagePos({
      x: pointer.x - pointUnderPointer.x * nextScale,
      y: pointer.y - pointUnderPointer.y * nextScale,
    });
  };

  const handleMouseDown = (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (readOnly) return;
    if (event.target !== event.target.getStage()) return;
    const stage = event.target.getStage();
    if (!stage) return;

    const position = toStageCoordinates(stage);
    if (!position) return;

    isSelecting.current = true;
    setSelectionBox({ x1: position.x, y1: position.y, x2: position.x, y2: position.y });
    if (!event.evt.shiftKey) onSelectIds([]);
  };

  const handleMouseMove = (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (readOnly) return;
    if (!isSelecting.current) return;
    const stage = event.target.getStage();
    if (!stage) return;

    const position = toStageCoordinates(stage);
    if (!position) return;
    setSelectionBox((current) =>
      current ? { ...current, x2: position.x, y2: position.y } : null,
    );
  };

  const handleMouseUp = () => {
    if (readOnly) return;
    if (!isSelecting.current || !selectionBox) {
      isSelecting.current = false;
      setSelectionBox(null);
      return;
    }

    isSelecting.current = false;
    const box = {
      x: Math.min(selectionBox.x1, selectionBox.x2),
      y: Math.min(selectionBox.y1, selectionBox.y2),
      width: Math.abs(selectionBox.x2 - selectionBox.x1),
      height: Math.abs(selectionBox.y2 - selectionBox.y1),
    };

    if (box.width > 4 || box.height > 4) {
      const hitIds = zones
        .filter(
          (zone) =>
            zone.posX < box.x + box.width &&
            zone.posX + zone.width > box.x &&
            zone.posY < box.y + box.height &&
            zone.posY + zone.height > box.y,
        )
        .map((zone) => zone.id);

      onSelectIds(Array.from(new Set([...selectedIds, ...hitIds])));
    }

    setSelectionBox(null);
  };

  const resetView = () => {
    if (readOnly) {
      const nextScale = Math.min(
        stageSize.width / CANVAS_WIDTH,
        stageSize.height / CANVAS_HEIGHT,
        1,
      );
      setScale(nextScale);
      setStagePos({
        x: Math.max((stageSize.width - CANVAS_WIDTH * nextScale) / 2, 0),
        y: Math.max((stageSize.height - CANVAS_HEIGHT * nextScale) / 2, 0),
      });
    } else {
      setScale(1);
      setStagePos({ x: 0, y: 0 });
    }
  };

  const gridLines = [];
  for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE) {
    gridLines.push(
      <Line key={`vertical-${x}`} points={[x, 0, x, CANVAS_HEIGHT]} stroke="#dfe7f1" strokeWidth={1} />,
    );
  }
  for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE) {
    gridLines.push(
      <Line key={`horizontal-${y}`} points={[0, y, CANVAS_WIDTH, y]} stroke="#dfe7f1" strokeWidth={1} />,
    );
  }

  return (
    <div className="wm-canvas-shell">
      <div className="wm-zoom-controls" aria-label="ควบคุมการซูม" style={{ right: 14 }}>
        <button
          type="button"
          onClick={() => setScale((current) => Math.min(current * 1.2, 2.5))}
          aria-label="ซูมเข้า"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setScale((current) => Math.max(current / 1.2, 0.4))}
          aria-label="ซูมออก"
        >
          −
        </button>
        <button type="button" className="wm-reset-view" onClick={resetView}>
          รีเซ็ตมุมมอง
        </button>
      </div>

      <div ref={scrollRef} className="wm-canvas-scroll">
        <Stage
          width={readOnly ? stageSize.width : CANVAS_WIDTH}
          height={readOnly ? stageSize.height : CANVAS_HEIGHT}
          scaleX={scale}
          scaleY={scale}
          x={stagePos.x}
          y={stagePos.y}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <Layer listening={false}>
            {gridLines}

            {/* กรอบอาคารอ้างอิงแปลนคลัง */}
            <Rect
              x={40}
              y={50}
              width={880}
              height={610}
              fill="rgba(255,255,255,.36)"
              stroke="#b8c7d9"
              strokeWidth={1}
              shadowColor="#0e3060"
              shadowBlur={12}
              shadowOpacity={0.08}
            />
            <Line points={[40, 50, 920, 50, 920, 660, 700, 660]} stroke="#71859f" strokeWidth={3} />
            <Line points={[540, 660, 40, 660, 40, 50]} stroke="#71859f" strokeWidth={3} />
            <Line points={[48, 58, 912, 58]} stroke="#cad5e2" strokeWidth={1} />
            <Line points={[48, 652, 532, 652]} stroke="#cad5e2" strokeWidth={1} />
            <Line points={[708, 652, 912, 652]} stroke="#cad5e2" strokeWidth={1} />

            {[
              { x: 130, width: 100, text: 'ทางเดินหลัก' },
              { x: 365, width: 90, text: 'ทางเดิน' },
              { x: 585, width: 90, text: 'ทางเดิน' },
              { x: 800, width: 40, text: '' },
            ].map((aisle, index) => (
              <Group key={`aisle-${index}`}>
                <Line
                  points={[aisle.x + aisle.width / 2, 170, aisle.x + aisle.width / 2, 545]}
                  stroke="#a9bad0"
                  strokeWidth={1}
                  dash={[5, 7]}
                  opacity={0.62}
                />
                {aisle.text && (
                  <Text
                    text={aisle.text}
                    x={aisle.x}
                    y={536}
                    width={aisle.width}
                    align="center"
                    fontSize={10}
                    fontFamily="Sarabun, Arial"
                    fill="#6f819a"
                  />
                )}
              </Group>
            ))}

            <Text
              text="▲"
              x={585}
              y={672}
              width={70}
              align="center"
              fontSize={24}
              fontFamily="Sarabun, Arial"
              fontStyle="bold"
              fill="#b33c2e"
            />
            <Text
              text="ทางเข้า"
              x={540}
              y={650}
              width={160}
              align="center"
              fontSize={12}
              fontFamily="Sarabun, Arial"
              fontStyle="bold"
              fill="#0e3060"
            />

          </Layer>

          <Layer>
            {zones.map((zone) => {
              const isSelected = selectedIds.includes(zone.id);
              const isHighlighted = highlightedIds.includes(zone.id);
              const isDimmed = dimUnhighlighted && !isHighlighted;
              const locationLabel = [zone.locationCode, zone.floor].filter(Boolean).join(' · ');
              const isVertical = zone.height > zone.width * 2;
              const isRack = /^[A-F]$/.test(zone.locationCode) && zone.floor.includes('4');
              const slotCount = Math.max(1, slotCounts[zone.id] ?? getZoneSlotCount(zone));
              const highlightedSlot = highlightedSlots[zone.id] ?? 0;
              const hasHighlightedSlot = Boolean(
                isHighlighted && highlightedSlot >= 1 && highlightedSlot <= slotCount,
              );
              const segmentWidth = isVertical ? zone.width : zone.width / slotCount;
              const segmentHeight = isVertical ? zone.height / slotCount : zone.height;
              const highlightedIndex = getRackSlotIndex(zone, highlightedSlot, slotCount, isVertical);
              const segmentX = isVertical ? 0 : highlightedIndex * segmentWidth;
              const segmentY = isVertical ? highlightedIndex * segmentHeight : 0;
              const badgeOnLeft = ['F', 'D', 'B', 'L'].includes(zone.locationCode);
              const rackBadgeX = isVertical
                ? badgeOnLeft ? -34 : zone.width + 4
                : segmentX + Math.max((segmentWidth - 30) / 2, 0);
              const rackBadgeY = isVertical
                ? segmentY + Math.max((segmentHeight - 18) / 2, 2)
                : zone.height + 4;

              return (
                <Group
                  key={zone.id}
                  ref={(node) => {
                    if (node) shapeRefs.current[zone.id] = node;
                  }}
                  x={zone.posX}
                  y={zone.posY}
                  draggable={!readOnly}
                  dragBoundFunc={(position) => ({
                    x: snapToGrid(position.x),
                    y: snapToGrid(position.y),
                  })}
                  onClick={(event) => {
                    event.cancelBubble = true;
                    if (readOnly) {
                      onZoneClick?.(zone.id);
                      return;
                    }
                    if (event.evt.shiftKey) {
                      onSelectIds(
                        isSelected
                          ? selectedIds.filter((id) => id !== zone.id)
                          : [...selectedIds, zone.id],
                      );
                    } else if (!isSelected) {
                      onSelectIds([zone.id]);
                    }
                  }}
                  onDblClick={(event) => {
                    event.cancelBubble = true;
                    if (readOnly) return;
                    onEdit(zone.id);
                  }}
                  onDragStart={() => {
                    if (readOnly) return;
                    if (!isSelected || selectedIds.length <= 1) return;

                    draggedZoneStart.current = { x: zone.posX, y: zone.posY };
                    dragStartPositions.current = {};
                    selectedIds.forEach((id) => {
                      const selectedZone = zones.find((candidate) => candidate.id === id);
                      if (selectedZone) {
                        dragStartPositions.current[id] = {
                          x: selectedZone.posX,
                          y: selectedZone.posY,
                        };
                      }
                    });
                  }}
                  onDragMove={(event) => {
                    if (readOnly) return;
                    if (!isSelected || selectedIds.length <= 1 || !draggedZoneStart.current) return;

                    const deltaX = event.target.x() - draggedZoneStart.current.x;
                    const deltaY = event.target.y() - draggedZoneStart.current.y;
                    selectedIds.forEach((id) => {
                      if (id === zone.id) return;
                      const startPosition = dragStartPositions.current[id];
                      const otherNode = shapeRefs.current[id];
                      if (startPosition && otherNode) {
                        otherNode.position({
                          x: startPosition.x + deltaX,
                          y: startPosition.y + deltaY,
                        });
                      }
                    });
                  }}
                  onDragEnd={(event) => {
                    if (readOnly) return;
                    event.cancelBubble = true;
                    const finalX = snapToGrid(event.target.x());
                    const finalY = snapToGrid(event.target.y());

                    if (isSelected && selectedIds.length > 1 && draggedZoneStart.current) {
                      const deltaX = finalX - draggedZoneStart.current.x;
                      const deltaY = finalY - draggedZoneStart.current.y;
                      const updates = selectedIds.map((id) => {
                        const startPosition = dragStartPositions.current[id] ?? {
                          x: zone.posX,
                          y: zone.posY,
                        };
                        return {
                          id,
                          posX: snapToGrid(startPosition.x + deltaX),
                          posY: snapToGrid(startPosition.y + deltaY),
                        };
                      });

                      onBulkDragEnd(updates);
                      draggedZoneStart.current = null;
                      dragStartPositions.current = {};
                    } else {
                      onDragEnd(zone.id, finalX, finalY);
                    }
                  }}
                  onTransformEnd={(event) => {
                    if (readOnly) return;
                    const node = event.target;
                    const nextWidth = Math.max(
                      MIN_SIZE,
                      snapToGrid(zone.width * node.scaleX()),
                    );
                    const nextHeight = Math.max(
                      MIN_SIZE,
                      snapToGrid(zone.height * node.scaleY()),
                    );

                    node.scaleX(1);
                    node.scaleY(1);
                    onResize(
                      zone.id,
                      snapToGrid(node.x()),
                      snapToGrid(node.y()),
                      nextWidth,
                      nextHeight,
                    );
                  }}
                >
                  <Rect
                    width={zone.width}
                    height={zone.height}
                    fill={isDimmed || hasHighlightedSlot ? '#94a3b8' : zone.color}
                    opacity={isDimmed || hasHighlightedSlot ? 0.3 : isHighlighted ? 1 : 0.82}
                    stroke={isHighlighted && !hasHighlightedSlot ? '#f4bd3f' : isSelected ? '#0e3060' : zone.color}
                    strokeWidth={isHighlighted && !hasHighlightedSlot ? 6 : isSelected ? 4 : 1}
                    cornerRadius={10}
                    shadowColor={isHighlighted && !hasHighlightedSlot ? '#c8972a' : '#0e3060'}
                    shadowBlur={isHighlighted && !hasHighlightedSlot ? 24 : isSelected ? 12 : 4}
                    shadowOpacity={isHighlighted && !hasHighlightedSlot ? 0.5 : isSelected ? 0.24 : 0.1}
                    shadowOffsetY={isHighlighted && !hasHighlightedSlot ? 6 : 3}
                  />
                  {hasHighlightedSlot && (
                    <Rect
                      x={segmentX}
                      y={segmentY}
                      width={segmentWidth}
                      height={segmentHeight}
                      fill={zone.color}
                      opacity={1}
                      stroke="#f4bd3f"
                      strokeWidth={5}
                      cornerRadius={6}
                      shadowColor="#c8972a"
                      shadowBlur={20}
                      shadowOpacity={0.55}
                    />
                  )}
                  {slotCount > 1 && Array.from({ length: slotCount - 1 }, (_, index) => index + 1).map((slot) => (
                    <Line
                      key={`slot-${slot}`}
                      points={isVertical
                        ? [0, zone.height * slot / slotCount, zone.width, zone.height * slot / slotCount]
                        : [zone.width * slot / slotCount, 0, zone.width * slot / slotCount, zone.height]}
                      stroke="rgba(255,255,255,.72)"
                      strokeWidth={1.5}
                    />
                  ))}
                  {hasHighlightedSlot && (
                    <>
                      <Rect
                        x={rackBadgeX}
                        y={rackBadgeY}
                        width={30}
                        height={18}
                        fill="#f4bd3f"
                        stroke="#ffffff"
                        strokeWidth={1.5}
                        cornerRadius={6}
                        shadowColor="#0e3060"
                        shadowBlur={6}
                        shadowOpacity={0.22}
                      />
                      <Text
                        text={`R${highlightedSlot}`}
                        x={rackBadgeX}
                        y={rackBadgeY + 3}
                        width={30}
                        align="center"
                        fontSize={10}
                        fontFamily="Sarabun, Arial"
                        fontStyle="bold"
                        fill="#0e3060"
                      />
                    </>
                  )}
                  {isVertical ? (
                    <Text
                      text={`${zone.locationCode} · ${zone.name}`}
                      x={Math.max((zone.width - 16) / 2, 4)}
                      y={zone.height - 12}
                      width={Math.max(zone.height - 24, 30)}
                      fontSize={isRack ? 13 : 12}
                      fontFamily="Sarabun, Arial"
                      fontStyle="bold"
                      fill="#ffffff"
                      align="center"
                      rotation={-90}
                      ellipsis
                      wrap="none"
                    />
                  ) : (
                    <>
                      <Text
                        text={`${zone.locationCode} · ${zone.name}`}
                        x={12}
                        y={10}
                        width={Math.max(zone.width - 24, 20)}
                        fontSize={zone.height <= 70 ? 13 : 16}
                        fontFamily="Sarabun, Arial"
                        fontStyle="bold"
                        fill="#ffffff"
                        ellipsis
                        wrap="none"
                      />
                      <Text
                        text={locationLabel || `${Math.round(zone.width)} × ${Math.round(zone.height)}`}
                        x={12}
                        y={zone.height <= 70 ? 32 : 36}
                        fontSize={10.5}
                        fontFamily="Sarabun, Arial"
                        fill="rgba(255,255,255,0.82)"
                      />
                    </>
                  )}
                  {readOnly && onSlotHover && slotCount >= 1 && Array.from(
                    { length: slotCount },
                    (_, index) => index + 1,
                  ).map((slotNumber) => {
                    const hoverWidth = isVertical ? zone.width : zone.width / slotCount;
                    const hoverHeight = isVertical ? zone.height / slotCount : zone.height;
                    const slotIndex = getRackSlotIndex(zone, slotNumber, slotCount, isVertical);
                    const hoverX = isVertical ? 0 : slotIndex * hoverWidth;
                    const hoverY = isVertical ? slotIndex * hoverHeight : 0;

                    return (
                      <Rect
                        key={`hover-slot-${slotNumber}`}
                        x={hoverX}
                        y={hoverY}
                        width={hoverWidth}
                        height={hoverHeight}
                        fill="rgba(255,255,255,0.001)"
                        onClick={(event) => {
                          event.cancelBubble = true;
                          onSlotClick?.({ zoneId: zone.id, slotNumber });
                        }}
                        onMouseEnter={(event) => {
                          const stage = event.target.getStage();
                          if (stage) stage.container().style.cursor = 'pointer';
                          onSlotHover({
                            zoneId: zone.id,
                            slotNumber,
                            clientX: event.evt.clientX,
                            clientY: event.evt.clientY,
                          });
                        }}
                        onMouseLeave={(event) => {
                          const stage = event.target.getStage();
                          if (stage) stage.container().style.cursor = 'default';
                          onSlotHover(null);
                        }}
                      />
                    );
                  })}
                </Group>
              );
            })}

            {!readOnly && (
              <Transformer
                ref={transformerRef}
                rotateEnabled={false}
                flipEnabled={false}
                anchorFill="#ffffff"
                anchorStroke="#0e3060"
                borderStroke="#0e3060"
                boundBoxFunc={(oldBox, newBox) =>
                  newBox.width < MIN_SIZE || newBox.height < MIN_SIZE ? oldBox : newBox
                }
              />
            )}

            {!readOnly && selectionBox && (
              <Rect
                x={Math.min(selectionBox.x1, selectionBox.x2)}
                y={Math.min(selectionBox.y1, selectionBox.y2)}
                width={Math.abs(selectionBox.x2 - selectionBox.x1)}
                height={Math.abs(selectionBox.y2 - selectionBox.y1)}
                fill="rgba(30, 107, 191, 0.14)"
                stroke="#1e6bbf"
                strokeWidth={1}
                dash={[5, 4]}
              />
            )}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
