import { polygonBoxForRadius } from "./geometry";
import { GRID_MAX, GRID_MIN, type Document } from "./types";

export type ValidateResult = { ok: true; doc: Document } | { ok: false; errors: string[] };

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

const KINDS = ["rect", "ellipse", "polygon", "path"];

function checkNum(o: Rec, key: string, label: string, errors: string[]): void {
  if (!isNum(o[key])) errors.push(`${label}: ${key} が数値ではありません`);
}
function checkBool(o: Rec, key: string, label: string, errors: string[]): void {
  if (typeof o[key] !== "boolean") errors.push(`${label}: ${key} が真偽値ではありません`);
}
function checkColor(o: Rec, key: string, label: string, errors: string[]): void {
  const v = o[key];
  if (v !== null && typeof v !== "string") errors.push(`${label}: style.${key} が文字列でも null でもありません`);
}

export function validateDocument(data: unknown): ValidateResult {
  const errors: string[] = [];
  if (!isRec(data)) return { ok: false, errors: ["データがオブジェクトではありません"] };

  if (data.version !== 1) errors.push("version が 1 ではありません");

  const grid = data.grid;
  if (!isRec(grid)) {
    errors.push("grid がオブジェクトではありません");
  } else {
    if (!isNum(grid.size) || grid.size < GRID_MIN || grid.size > GRID_MAX) {
      errors.push(`grid.size が ${GRID_MIN} から ${GRID_MAX} の数値ではありません`);
    }
    if (typeof grid.visible !== "boolean") errors.push("grid.visible が真偽値ではありません");
    if (typeof grid.snap !== "boolean") errors.push("grid.snap が真偽値ではありません");
  }

  if (!Array.isArray(data.nodes)) {
    errors.push("nodes が配列ではありません");
  } else {
    const seen = new Set<string>();
    data.nodes.forEach((raw: unknown, i: number) => {
      const name = isRec(raw) && typeof raw.name === "string" ? raw.name : "";
      const label = `図形 ${i + 1}（${name}）`;
      if (!isRec(raw)) {
        errors.push(`${label}: オブジェクトではありません`);
        return;
      }
      if (typeof raw.id !== "string" || raw.id === "") {
        errors.push(`${label}: id が文字列ではありません`);
      } else if (seen.has(raw.id)) {
        errors.push(`${label}: id「${raw.id}」が重複しています`);
      } else {
        seen.add(raw.id);
      }
      if (typeof raw.name !== "string") errors.push(`${label}: name が文字列ではありません`);
      checkBool(raw, "visible", label, errors);
      checkBool(raw, "locked", label, errors);
      if (raw.role !== "add" && raw.role !== "subtract") {
        errors.push(`${label}: role が add か subtract ではありません`);
      }

      const t = raw.transform;
      if (!isRec(t)) {
        errors.push(`${label}: transform がオブジェクトではありません`);
      } else {
        for (const k of ["x", "y", "rotation"]) {
          if (!isNum(t[k])) errors.push(`${label}: transform.${k} が数値ではありません`);
        }
      }

      const s = raw.style;
      if (!isRec(s)) {
        errors.push(`${label}: style がオブジェクトではありません`);
      } else {
        checkColor(s, "fill", label, errors);
        checkColor(s, "stroke", label, errors);
        for (const k of ["strokeWidth", "opacity"]) {
          if (!isNum(s[k])) errors.push(`${label}: style.${k} が数値ではありません`);
        }
      }

      const kind = raw.kind;
      if (typeof kind !== "string" || !KINDS.includes(kind)) {
        errors.push(`${label}: kind「${String(kind)}」は知らない種類です`);
        return;
      }
      switch (kind) {
        case "rect":
          for (const k of ["width", "height", "cornerRadius"]) checkNum(raw, k, label, errors);
          break;
        case "ellipse":
          for (const k of ["rx", "ry"]) checkNum(raw, k, label, errors);
          break;
        case "polygon":
          for (const k of ["sides", "starRatio"]) checkNum(raw, k, label, errors);
          if (isNum(raw.width) && isNum(raw.height)) {
            // current format
          } else if (isNum(raw.radius) && !("width" in raw) && !("height" in raw)) {
            // old format: only a radius; upgraded below
          } else {
            checkNum(raw, "width", label, errors);
            checkNum(raw, "height", label, errors);
          }
          break;
        case "path":
          checkBool(raw, "closed", label, errors);
          checkBool(raw, "smooth", label, errors);
          checkNum(raw, "tension", label, errors);
          if (!Array.isArray(raw.points)) {
            errors.push(`${label}: points が配列ではありません`);
          } else {
            raw.points.forEach((p: unknown, j: number) => {
              if (!isRec(p) || !isNum(p.x) || !isNum(p.y) || typeof p.corner !== "boolean") {
                errors.push(`${label}: points[${j}] の x・y（数値）か corner（真偽値）が正しくありません`);
              }
            });
          }
          break;
      }
    });
  }

  if (data.guides !== undefined) {
    if (!Array.isArray(data.guides)) {
      errors.push("guides が配列ではありません");
    } else {
      data.guides.forEach((g: unknown, i: number) => {
        if (!isRec(g) || typeof g.id !== "string" || (g.axis !== "h" && g.axis !== "v") || !isNum(g.pos)) {
          errors.push(`ガイド ${i + 1}: id（文字列）、axis（h か v）、pos（数値）が正しくありません`);
        }
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  const doc = data as unknown as Document;
  const nodes = (data.nodes as Rec[]).map((raw) => {
    if (raw.kind === "polygon" && !isNum(raw.width) && isNum(raw.radius)) {
      const { radius, ...rest } = raw;
      const box = polygonBoxForRadius(raw.sides as number, raw.starRatio as number, radius as number);
      return { ...rest, width: box.width, height: box.height };
    }
    if (raw.kind === "path" && raw.smooth === false) {
      const pts = (raw.points as Rec[]).map((p) => ({ ...p, corner: false }));
      return { ...raw, points: pts };
    }
    return raw;
  });
  return { ok: true, doc: { ...doc, nodes: nodes as unknown as Document["nodes"] } };
}

