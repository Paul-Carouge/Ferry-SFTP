export interface DragPayload {
  side: "local" | "remote";
  connectionId?: string;
  path: string;
  name: string;
  isDir: boolean;
  size: number;
}

let _payloads: DragPayload[] | null = null;
let _lastX = 0;
let _lastY = 0;

export function getDragPayloads(): DragPayload[] | null {
  return _payloads;
}

export function setDragPayloads(payloads: DragPayload[] | null): void {
  _payloads = payloads;
}

export function setLastDragPos(x: number, y: number): void {
  _lastX = x;
  _lastY = y;
}

export function getLastDragPos(): { x: number; y: number } {
  return { x: _lastX, y: _lastY };
}
