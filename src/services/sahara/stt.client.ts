/** Browser microphone capture with live interim transcript + Sahara final STT. */
export const TARGET_SAMPLE_RATE = 16000;
export class MicrophoneError extends Error { constructor(message:string,public reason:"denied"|"unavailable"|"empty"){super(message);this.name="MicrophoneError";} }

type RecognitionResultLike={isFinal:boolean;0?:{transcript?:string}};
type RecognitionEventLike={resultIndex:number;results:ArrayLike<RecognitionResultLike>};
type RecognitionLike={continuous:boolean;interimResults:boolean;lang:string;start():void;stop():void;abort():void;onresult:((e:RecognitionEventLike)=>void)|null;onerror:((e:unknown)=>void)|null;onend:(()=>void)|null};
type RecognitionCtor=new()=>RecognitionLike;

export interface Recorder { stop():Promise<Float32Array>; cancel():void; level():number; transcript():string; }

function startLiveRecognition(language:string){
  const w=window as typeof window & {SpeechRecognition?:RecognitionCtor;webkitSpeechRecognition?:RecognitionCtor};
  const Ctor=w.SpeechRecognition??w.webkitSpeechRecognition;if(!Ctor)return null;
  const recognition=new Ctor();recognition.continuous=true;recognition.interimResults=true;recognition.lang=language||"en-NG";
  let finalText="",interim="",active=true;
  recognition.onresult=(event)=>{interim="";for(let i=event.resultIndex;i<event.results.length;i++){const r=event.results[i];const text=r?.[0]?.transcript?.trim()??"";if(!text)continue;if(r.isFinal)finalText=`${finalText} ${text}`.trim();else interim=`${interim} ${text}`.trim();}};
  recognition.onerror=()=>{};recognition.onend=()=>{active=false;};
  try{recognition.start();}catch{return null;}
  return{get:()=>`${finalText} ${interim}`.trim(),stop:()=>{if(active){try{recognition.stop();}catch{}active=false;}},abort:()=>{try{recognition.abort();}catch{}active=false;}};
}

export async function startRecording(maxSeconds:number,language="en-NG"):Promise<Recorder>{
 if(typeof navigator==="undefined"||!navigator.mediaDevices?.getUserMedia)throw new MicrophoneError("This device can't reach a microphone. You can still type your question to Dami.","unavailable");
 let stream:MediaStream;try{stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});}catch(error){const name=(error as DOMException)?.name;if(name==="NotAllowedError"||name==="SecurityError")throw new MicrophoneError("Dami needs microphone access to listen. Allow microphone access, then try again.","denied");throw new MicrophoneError("Dami couldn't open your microphone. Check that it is connected and free.","unavailable");}
 const recognition=startLiveRecognition(language);
 const AudioCtx=window.AudioContext??(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;const context=new AudioCtx();if(context.state==="suspended")await context.resume();const source=context.createMediaStreamSource(stream),processor=context.createScriptProcessor(2048,1,1),gain=context.createGain();gain.gain.value=0;const buffers:Float32Array[]=[];let peak=0,stopped=false;
 processor.onaudioprocess=(event)=>{if(stopped)return;const input=event.inputBuffer.getChannelData(0);buffers.push(new Float32Array(input));let p=0;for(let i=0;i<input.length;i+=8)p=Math.max(p,Math.abs(input[i]!));peak=peak*.68+p*.32;};source.connect(processor);processor.connect(gain);gain.connect(context.destination);
 const teardown=()=>{if(stopped)return;stopped=true;processor.disconnect();gain.disconnect();source.disconnect();stream.getTracks().forEach(t=>t.stop());recognition?.stop();};const autoStop=setTimeout(teardown,maxSeconds*1000);
 return{async stop(){clearTimeout(autoStop);const sr=context.sampleRate;teardown();const merged=concat(buffers);void context.close();if(!merged.length)throw new MicrophoneError("Dami didn't receive any microphone audio. Try again.","empty");return resample(merged,sr,TARGET_SAMPLE_RATE);},cancel(){clearTimeout(autoStop);recognition?.abort();teardown();void context.close();buffers.length=0;},level:()=>Math.min(1,peak*3),transcript:()=>recognition?.get()??""};
}
function concat(buffers:Float32Array[]){const total=buffers.reduce((n,b)=>n+b.length,0),out=new Float32Array(total);let offset=0;for(const b of buffers){out.set(b,offset);offset+=b.length;}return out;}
export function resample(input:Float32Array,from:number,to:number){if(from===to)return input;const ratio=from/to,out=new Float32Array(Math.floor(input.length/ratio));for(let i=0;i<out.length;i++){const p=i*ratio,l=Math.floor(p),h=Math.min(l+1,input.length-1),w=p-l;out[i]=input[l]!*(1-w)+input[h]!*w;}return out;}
export function floatToPcm16Base64(samples:Float32Array){const buffer=new ArrayBuffer(samples.length*2),view=new DataView(buffer);for(let i=0;i<samples.length;i++){const c=Math.max(-1,Math.min(1,samples[i]!));view.setInt16(i*2,c<0?c*0x8000:c*0x7fff,true);}let binary="";const bytes=new Uint8Array(buffer),CHUNK=0x8000;for(let i=0;i<bytes.length;i+=CHUNK)binary+=String.fromCharCode(...bytes.subarray(i,i+CHUNK));return btoa(binary);}
export interface TranscriptionResult{text:string;durationMs:number;requestId:string|null;}
export async function transcribeSamples(samples:Float32Array,options:{language:string;codeSwitching:boolean;browserTranscript?:string}):Promise<TranscriptionResult>{
 const fallback=options.browserTranscript?.trim()??"";const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
 try{const response=await fetch("/api/sahara-stt",{method:"POST",headers:{"Content-Type":"application/json"},signal:controller.signal,body:JSON.stringify({audioBase64:floatToPcm16Base64(samples),sampleRate:TARGET_SAMPLE_RATE,language:options.language,codeSwitching:options.codeSwitching})});const raw=await response.text();let payload:({error?:string}&Partial<TranscriptionResult>)|null=null;try{payload=raw?JSON.parse(raw):null;}catch{}if(response.ok&&payload?.text?.trim())return{text:payload.text.trim(),durationMs:payload.durationMs??0,requestId:payload.requestId??null};if(fallback)return{text:fallback,durationMs:0,requestId:null};throw new Error(payload?.error?.trim()||`Speech transcription failed (HTTP ${response.status}). Please try again.`);}catch(error){if(fallback)return{text:fallback,durationMs:0,requestId:null};if((error as Error)?.name==="AbortError")throw new Error("Sahara is taking too long to transcribe right now. Please try again.");throw new Error("Dami couldn't reach the speech server. Check your connection and try again.");}finally{clearTimeout(timer);}
}
