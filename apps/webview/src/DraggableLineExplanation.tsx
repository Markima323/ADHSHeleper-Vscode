import { useEffect, useRef, useState } from "react";
import { AdhdExplanation } from "./AdhdExplanation";

export type LineExplanationState = {
  chunkId: string;
  lineIndex: number;
  displayLine: number;
  code: string;
  status: "loading" | "needs-key" | "ready" | "error";
  text?: string;
  message?: string;
  source?: "local" | "api";
};

type Props = {
  value: LineExplanationState;
  boldRatio: number;
  providerName: string;
  onClose(): void;
  onRetry(): void;
  onSetup(): void;
};

export function DraggableLineExplanation({ value, boldRatio, providerName, onClose, onRetry, onSetup }: Props) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => setPosition(null), [value.chunkId, value.lineIndex]);

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    const box = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!box) return;
    drag.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - box.left,
      offsetY: event.clientY - box.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPosition({ x: box.left, y: box.top });
  };
  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const width = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 360;
    setPosition({
      x: Math.max(8, Math.min(window.innerWidth - width - 8, event.clientX - drag.current.offsetX)),
      y: Math.max(8, Math.min(window.innerHeight - 80, event.clientY - drag.current.offsetY)),
    });
  };
  const stopDragging = (event: React.PointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };

  return <aside
    className="line-explanation-window"
    style={position ? { left: position.x, top: position.y, right: "auto" } : undefined}
    aria-label={`第 ${value.displayLine} 行的 ${providerName} 解释`}
  >
    <header
      className="floating-titlebar"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
    >
      <span><span className="spark">✦</span> 第 {value.displayLine} 行解释</span>
      <button type="button" aria-label="关闭行级解释" onPointerDown={(event) => event.stopPropagation()} onClick={onClose}>×</button>
    </header>
    <div className="floating-content">
      <code className="line-code-preview">{value.code.trim() || "（空行）"}</code>
      {value.status === "loading" && <p className="floating-message">{providerName} 正在解析这一行…</p>}
      {value.status === "ready" && <>
        <AdhdExplanation text={value.text ?? ""} boldRatio={boldRatio} />
        {value.source === "local" && <span className="local-record">已从 D:\codeLearn 读取</span>}
      </>}
      {value.status === "needs-key" && <div className="floating-state">
        <p>需要先配置 {providerName} API Key。</p>
        <button className="secondary" onClick={onSetup}>设置 API Key</button>
      </div>}
      {value.status === "error" && <div className="floating-state error-box">
        <p>{value.message ?? "解释生成失败。"}</p>
        <button className="secondary" onClick={onRetry}>重试</button>
      </div>}
    </div>
  </aside>;
}
