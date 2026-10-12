import React,{useEffect,useRef,useState} from 'react';
import {cupGeometry} from '../engine/cupGeometry.js';
export default function StanleyCup3D({children,size=210}){
  const ref=useRef(null),[failed,setFailed]=useState(false),[rotating,setRotating]=useState(true),angle=useRef(.35),drag=useRef(null);
  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;let gl,program,buffers=[],raf;
    try{
      gl=canvas.getContext('webgl',{alpha:true,antialias:true});if(!gl)throw Error('WebGL unavailable');
      const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
      const vs=shader(gl.VERTEX_SHADER,'attribute vec3 p;attribute vec3 n;uniform float a;uniform float aspect;varying vec3 norm;varying vec3 world;varying vec3 local;void main(){local=p;mat3 r=mat3(cos(a),0.,-sin(a),0.,1.,0.,sin(a),0.,cos(a));vec3 q=r*p;norm=r*n;world=q;float z=q.z+4.4;gl_Position=vec4(q.x*2.3/aspect,q.y*2.3+.36,z-1.,z);}');
      const fs=shader(gl.FRAGMENT_SHADER,`precision mediump float;
        varying vec3 norm;varying vec3 world;varying vec3 local;
        void main(){
          vec3 n=normalize(norm),v=normalize(vec3(0.,.35,-4.4)-world);
          vec3 r=reflect(-v,n);
          float key=max(0.,dot(n,normalize(vec3(-2.,3.,-4.))));
          float fill=max(0.,dot(n,normalize(vec3(3.,1.,-3.))));
          // Bright studio softboxes reflected in polished, neutral silver.
          float left=pow(max(0.,dot(r,normalize(vec3(-.8,.15,-1.)))),12.);
          float right=pow(max(0.,dot(r,normalize(vec3(.95,.1,-.7)))),23.);
          float top=pow(max(0.,dot(r,normalize(vec3(0.,1.,-.4)))),8.);
          float edge=pow(1.-max(0.,dot(n,v)),3.);
          float spec=pow(max(0.,dot(reflect(-normalize(vec3(-2.,3.,-4.)),n),v)),65.);
          vec3 metal=vec3(.43,.46,.49)+vec3(.25)*key+vec3(.10)*fill;
          metal+=vec3(.50)*left+vec3(.42)*right+vec3(.30)*top+vec3(.17,.19,.21)*edge+vec3(.40)*spec;
          // Fine etched name rows in the five barrel bands, fixed to the cup.
          float theta=atan(local.z,local.x);
          float row=fract((local.y+1.4)*58.);
          float col=fract(theta*19.);
          float etch=step(.72,row)*step(.15,col)*step(col,.82);
          float barrel=step(-1.39,local.y)*step(local.y,-.37);
          metal-=vec3(.065)*etch*barrel*(.5+.5*key);
          if(local.y>.64 && n.y>.3)metal*=.83;
          gl_FragColor=vec4(clamp(metal,0.,1.),1.);
        }`);
      program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Cup shader linking failed');gl.useProgram(program);
      const geom=cupGeometry();for(const [name,data] of [['p',geom.positions],['n',geom.normals]]){const b=gl.createBuffer();buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);}
      const loc=gl.getUniformLocation(program,'a');gl.uniform1f(gl.getUniformLocation(program,'aspect'),canvas.width/canvas.height);gl.enable(gl.DEPTH_TEST);
      const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;let last=0;
      const frame=now=>{if(last && rotating && !reduced && drag.current==null)angle.current+=Math.min(now-last,50)*.00025;last=now;gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform1f(loc,angle.current);gl.drawArrays(gl.TRIANGLES,0,geom.positions.length/3);raf=requestAnimationFrame(frame);};raf=requestAnimationFrame(frame);
    }catch{setFailed(true);}
    return ()=>{cancelAnimationFrame(raf);if(gl){buffers.forEach(b=>gl.deleteBuffer(b));if(program)gl.deleteProgram(program);}};
  },[rotating]);
  return <div className="cup3d" style={{width:size}}>{failed?children:<canvas ref={ref} width={size*2} height={size*2.6} style={{width:size,height:size*1.3,touchAction:'pan-y'}} aria-label="Interactive three dimensional Stanley Cup. Drag to rotate." role="img" onPointerDown={e=>{drag.current=e.clientX;e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(drag.current!==null){angle.current+=(e.clientX-drag.current)*.015;drag.current=e.clientX;}}} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}/>}</div>;
}
