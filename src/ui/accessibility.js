import {useEffect,useRef} from 'react';
export function useDialogFocus(ref,onClose){
 const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  const previous=document.activeElement,node=ref.current;
  const focusable=()=>[...(node?.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') || [])].filter(el=>el.getClientRects().length);
  (node?.querySelector('[data-autofocus]') || focusable()[0] || node)?.focus();
  const key=e=>{const dialogs=[...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')];if(dialogs.at(-1)!==node)return;
   if(e.key==='Escape'){e.preventDefault();close.current?.();}
   if(e.key==='Tab'){const els=focusable(),first=els[0],last=els.at(-1);if(!first){e.preventDefault();node?.focus();}else if(e.shiftKey && (document.activeElement===first || document.activeElement===node)){e.preventDefault();last.focus();}else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}}
  };
  document.addEventListener('keydown',key);const old=document.body.style.overflow;document.body.style.overflow='hidden';
  return ()=>{document.removeEventListener('keydown',key);document.body.style.overflow=old;if(previous?.isConnected)previous.focus();};
 },[ref]);
}
