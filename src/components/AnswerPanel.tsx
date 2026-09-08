import { FileDown, Pause, Play, Volume2 } from "lucide-react";
import { SourceCard } from "@/components/SourceCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResearchAnswer, ResearchSession } from "@/lib/types";
import { composeDocument, exportDocument, saveDocument } from "@/services/documents/documents";
import { toast } from "sonner";

interface AnswerPanelProps { question:string; answer:ResearchAnswer; session?:ResearchSession|null; speaking?:boolean; paused?:boolean; onReadAloud?:()=>void; onToggleSpeech?:()=>void; }

function cleanInline(text:string){return text.replace(/\[(S\d+)\]/g,"[$1]").replace(/\*\*/g,"").replace(/__/g,"").replace(/`/g,"").replace(/[—–]/g,", ").replace(/\s+([,.;:!?])/g,"$1").replace(/\s{2,}/g," ").trim();}
function cleanAnswer(text:string){
 const lines=(text??"").replace(/\r/g,"").split("\n");const blocks:string[]=[];let paragraph:string[]=[];
 const flush=()=>{const value=cleanInline(paragraph.join(" "));if(value)blocks.push(value);paragraph=[];};
 for(const raw of lines){let line=raw.trim();if(!line){flush();continue;}if(/^\|?\s*:?-{3,}/.test(line)||/^[-| :]+$/.test(line))continue;line=line.replace(/^#{1,6}\s*/,"").replace(/^[-*+]\s+/,"• ").replace(/^\d+[.)]\s+/,m=>m.trim()+" ");if(line.includes("|")&&line.split("|").filter(Boolean).length>1){flush();const cells=line.split("|").map(c=>cleanInline(c)).filter(Boolean);if(cells.length)blocks.push(cells.join(" · "));continue;}if(/^[A-Z][A-Za-z &/-]{2,40}:?$/.test(line)&&!/[.!?]$/.test(line)){flush();blocks.push(cleanInline(line.replace(/:$/,"")));continue;}paragraph.push(line);}
 flush();return blocks;
}

export function AnswerPanel({question,answer,session,speaking,paused,onReadAloud,onToggleSpeech}:AnswerPanelProps){
 function handleSave(kind:"research-note"|"legal-memo"){if(!session)return;const doc=composeDocument(session,kind);saveDocument(doc);toast.success(kind==="legal-memo"?"Legal memo saved.":"Research note saved.");exportDocument(doc,"md");}
 const blocks=cleanAnswer(answer.answer);
 return <div className="space-y-6"><Card className="shadow-[var(--shadow-soft)]"><CardHeader className="space-y-1"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your question</p><CardTitle className="text-lg leading-snug">{cleanInline(question)}</CardTitle></CardHeader><CardContent className="space-y-6">{answer.insufficientEvidence?<Alert><AlertTitle>Dami needs stronger sources for this</AlertTitle><AlertDescription>{cleanInline(answer.limitations||"Dami does not have enough reliable authority to answer this safely. Try adding the country or jurisdiction, or check with a qualified lawyer.")}</AlertDescription></Alert>:<div className="space-y-4 text-[0.975rem] leading-7">{blocks.map((block,index)=>block.startsWith("• ")?<div key={index} className="flex gap-2"><span className="mt-0.5 text-primary">•</span><p>{block.slice(2)}</p></div>:<p key={index}>{block}</p>)}</div>}
 {answer.keyFindings.length>0&&<div className="space-y-2"><h3 className="text-sm font-semibold">Key findings</h3><ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">{answer.keyFindings.map(f=><li key={f}>{cleanInline(f)}</li>)}</ul></div>}
 {!answer.insufficientEvidence&&answer.limitations?<p className="rounded-lg bg-muted/60 p-3 text-sm leading-6 text-muted-foreground">{cleanInline(answer.limitations)}</p>:null}
 <div className="flex flex-wrap gap-2">{speaking?<Button variant="secondary" onClick={onToggleSpeech}>{paused?<><Play className="mr-2 h-4 w-4"/>Resume</>:<><Pause className="mr-2 h-4 w-4"/>Pause</>}</Button>:onReadAloud&&<Button variant="secondary" onClick={onReadAloud}><Volume2 className="mr-2 h-4 w-4"/>Read aloud</Button>}{session&&<><Button variant="outline" onClick={()=>handleSave("research-note")}><FileDown className="mr-2 h-4 w-4"/>Save research note</Button><Button variant="outline" onClick={()=>handleSave("legal-memo")}><FileDown className="mr-2 h-4 w-4"/>Save legal memo</Button></>}</div></CardContent></Card>
 <section className="space-y-3"><h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Authorities relied on</h2>{answer.citations.length===0?<p className="text-sm text-muted-foreground">No authority was cited, so nothing here should be treated as settled law.</p>:<div className="grid gap-4 md:grid-cols-2">{answer.citations.map(c=><SourceCard key={c.sourceId} source={c}/>)}</div>}</section></div>;
}
