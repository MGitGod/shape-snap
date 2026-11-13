export interface Point { x: number; y: number }
export type Role = 'add' | 'subtract';
export interface Style { fill: string | null; stroke: string | null; strokeWidth: number; opacity: number }
export interface Transform { x: number; y: number; rotation: number }   // x,y = center of the shape
export interface NodeBase {
  id: string; name: string; visible: boolean; locked: boolean;
  role: Role; transform: Transform; style: Style;
}
export interface RectNode extends NodeBase { kind: 'rect'; width: number; height: number; cornerRadius: number }
export interface EllipseNode extends NodeBase { kind: 'ellipse'; rx: number; ry: number }
export interface PolygonNode extends NodeBase { kind: 'polygon'; sides: number; width: number; height: number; starRatio: number }
export interface PathPoint { x: number; y: number; corner: boolean }      // relative to the shape center
export interface PathNode extends NodeBase { kind: 'path'; points: PathPoint[]; closed: boolean; smooth: boolean; tension: number }
export type SceneNode = RectNode | EllipseNode | PolygonNode | PathNode;
export type NodeKind = SceneNode['kind'];
export interface GridSettings { size: number; visible: boolean; snap: boolean }
export interface Document { version: 1; grid: GridSettings; nodes: SceneNode[] }
export type Anchor = 'auto' | 'center' | 'tl' | 'tr' | 'bl' | 'br';
export const GRID_MIN = 5; export const GRID_MAX = 160;
