import React from 'react';
export default function FeedbackToast({message}){
 const text=String(message),warning=/failed|blocked|invalid|rejected|not enough|cannot|declined|paused|injur|unhappy/i.test(text),success=!warning&&/saved|signed|agreed|upgraded|assigned|complete|updated|withdrawn|restored/i.test(text);
 return <div className={`toast feedback-toast ${warning?'feedback-warning':success?'feedback-success':'feedback-info'}`} role="status" aria-live="polite"><span className="feedback-symbol" aria-hidden="true">{warning?'!':success?'✓':'i'}</span><span><b>{warning?'A moment, GM':success?'Good move':'Club update'}</b><span>{message}</span></span></div>;
}
