export interface Point { x: number; y: number }
export type Role = 'add' | 'subtract';
export interface Style { fill: string | null; stroke: string | null; strokeWidth: number; opacity: number }
export interface Transform { x: number; y: number; rotation: number }   // x,y = center of the shape
export interface NodeCommon { id: string; name: string; visible: boolean; locked: boolean; role: Role }
export interface LeafBase extends NodeCommon { transform: Transform; style: Style }
export type NodeBase = LeafBase;
export interface RectNode extends LeafBase { kind: 'rect'; width: number; height: number; cornerRadius: number }
export interface EllipseNode extends LeafBase { kind: 'ellipse'; rx: number; ry: number }
export interface PolygonNode extends LeafBase { kind: 'polygon'; sides: number; width: number; height: number; starRatio: number }
export interface PathPoint { x: number; y: number; corner: boolean }      // relative to the shape center
export interface PathNode extends LeafBase { kind: 'path'; points: PathPoint[]; closed: boolean; smooth: boolean; tension: number }
export type LeafNode = RectNode | EllipseNode | PolygonNode | PathNode;
export interface GroupNode extends NodeCommon { kind: 'group'; children: SceneNode[] }
export interface RepeatNode extends NodeCommon {
  kind: 'repeat'; child: SceneNode;
  count: number;        // 2..50
  dx: number; dy: number;   // offset to the next copy (units)
  scaleStep: number;    // scale factor per step, 0.5..1.5
  rotateStep: number;   // rotation per step in degrees, -180..180
}
export type MirrorMode = 'h' | 'v' | 'both' | 'rotate';   // h = left-right (vertical axis), v = up-down (horizontal axis)
export interface MirrorNode extends NodeCommon {
  kind: 'mirror'; child: SceneNode; mode: MirrorMode;
  count: number;        // number of copies for 'rotate', 2..36
  axisX: number; axisY: number;   // point the axis passes through (world coordinates)
}
export type ContainerNode = GroupNode | RepeatNode | MirrorNode;
export type SceneNode = LeafNode | ContainerNode;
export type NodeKind = SceneNode['kind'];
export function isLeaf(n: SceneNode): n is LeafNode {
  return n.kind !== 'group' && n.kind !== 'repeat' && n.kind !== 'mirror';
}
export interface GridSettings { size: number; visible: boolean; snap: boolean }
export interface Guide { id: string; axis: 'h' | 'v'; pos: number }       // h = horizontal line (y = pos), v = vertical line (x = pos)
export interface Document { version: 1; grid: GridSettings; nodes: SceneNode[]; guides?: Guide[] }
export type Anchor = 'auto' | 'center' | 'tl' | 'tr' | 'bl' | 'br';
export const GRID_MIN = 5; export const GRID_MAX = 160;
