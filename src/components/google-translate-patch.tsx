"use client";

const PATCH_FLAG = "__strikeTranslateDomPatch";

/**
 * Google Translate оборачивает текстовые узлы в <font>. React потом вызывает
 * removeChild/insertBefore у старого родителя и падает с NotFoundError.
 * Если узел уже не прямой ребёнок — тихо выходим.
 */
function patchGoogleTranslateDom() {
  if (typeof window === "undefined") return;
  const marker = window as Window & { [PATCH_FLAG]?: boolean };
  if (marker[PATCH_FLAG]) return;
  marker[PATCH_FLAG] = true;

  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function removeChildPatched<T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  };

  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function insertBeforePatched<T extends Node>(
    this: Node,
    node: T,
    child: Node | null,
  ): T {
    if (child && child.parentNode !== this) return node;
    return insertBefore.call(this, node, child) as T;
  };
}

patchGoogleTranslateDom();

export function GoogleTranslatePatch() {
  patchGoogleTranslateDom();
  return null;
}
