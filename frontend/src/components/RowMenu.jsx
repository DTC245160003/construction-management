import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./OperationsIcon";
import "../styles/RowMenu.css";

export default function RowMenu({ label, actions }) {
  const [position, setPosition] = useState(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!position) return undefined;
    menu.current?.querySelector("button")?.focus({ preventScroll:true });
    const close = (event) => {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "pointerdown" && (menu.current?.contains(event.target) || trigger.current?.contains(event.target))) return;
      setPosition(null);
      if (event.type === "keydown") trigger.current?.focus();
    };
    const reposition = () => {
      const rect=trigger.current.getBoundingClientRect();
      if (rect.bottom<0 || rect.top>window.innerHeight) { setPosition(null); return; }
      setPosition({ top:Math.min(rect.bottom+6,window.innerHeight-actions.length*42-18),left:Math.max(8,Math.min(rect.right-210,window.innerWidth-218)) });
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, [position,actions.length]);
  return <><button type="button" className="visual-row-menu-trigger" ref={trigger} aria-label={label} aria-expanded={Boolean(position)} aria-controls={position ? id : undefined} onClick={()=>{const rect=trigger.current.getBoundingClientRect();setPosition(position ? null : {top:Math.min(rect.bottom+6,window.innerHeight-actions.length*42-18),left:Math.max(8,Math.min(rect.right-210,window.innerWidth-218))});}}><Icon name="more" size={18}/></button>{position && createPortal(<div id={id} ref={menu} className="visual-row-menu" style={position} aria-label={label}>{actions.map((action)=><button type="button" key={action.label} className={action.danger ? "is-danger" : ""} onClick={()=>{setPosition(null);trigger.current?.focus();action.onClick();}}><Icon name={action.icon || "edit"} size={16}/>{action.label}</button>)}</div>,document.body)}</>;
}
