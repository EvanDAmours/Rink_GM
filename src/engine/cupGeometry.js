// A surface of revolution: an original three dimensional cup, five barrel bands,
// stepped neck and bowl. Positions/normals are independent of browser WebGL.
export function cupGeometry(segments=128){
  const profile=[[0,-1.5],[.62,-1.5],[.65,-1.47],[.65,-1.43],[.61,-1.40]];
  // Five subtly tapered championship bands with narrow rolled silver seams.
  for(let i=0;i<5;i++){
    const y=-1.40+i*.21,r=.61-i*.012;
    profile.push([r,y],[r,y+.185],[r+.012,y+.19],[r+.012,y+.205],[r-.012,y+.21]);
  }
  profile.push([.54,-.35],[.50,-.31],[.46,-.30],[.46,-.24],[.34,-.22],
    [.34,-.07],[.36,-.05],[.36,-.015],[.32,0],[.32,.16],[.34,.18],
    [.34,.215],[.29,.23],[.27,.30],[.18,.32],[.16,.40],[.20,.48],
    [.27,.53],[.34,.59],[.40,.67],[.45,.77],[.48,.89],[.49,1.01],
    [.505,1.02],[.505,1.055],[.47,1.055],[.46,1.01],[.445,.89],
    [.405,.78],[.35,.69],[.28,.63],[.19,.60],[0,.59]);
  const positions=[],normals=[];
  for(let i=0;i<profile.length-1;i++)for(let j=0;j<segments;j++){
    const [r,y]=profile[i],[rr,yy]=profile[i+1],a=j/segments*2*Math.PI,b=(j+1)/segments*2*Math.PI;
    const len=Math.hypot(yy-y,rr-r)||1,nr=(yy-y)/len,ny=(r-rr)/len;
    for(const [radius,height,angle] of [[r,y,a],[rr,yy,a],[rr,yy,b],[r,y,a],[rr,yy,b],[r,y,b]]){positions.push(radius*Math.cos(angle),height,radius*Math.sin(angle));normals.push(nr*Math.cos(angle),ny,nr*Math.sin(angle));}
  }
  return {positions:new Float32Array(positions),normals:new Float32Array(normals)};
}
