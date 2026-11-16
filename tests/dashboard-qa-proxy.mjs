// Isolated visual fault injection. Never forwards outside the loopback QA server.
import http from 'node:http';
let recordRequests=0;
http.createServer((req,res)=>{
 if(req.method==='GET'&&req.url==='/api/records'&&[1,3].includes(++recordRequests)){
  res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify({error:'QA: saved records are temporarily unavailable.'}));return;
 }
 const upstream=http.request({hostname:'127.0.0.1',port:5203,path:req.url,method:req.method,headers:{...req.headers,host:'127.0.0.1:5203'}},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
 upstream.on('error',()=>{res.writeHead(502);res.end('The isolated QA server is unavailable.');});req.pipe(upstream);
}).listen(5204,'127.0.0.1',()=>console.log('QA-only proxy: 127.0.0.1:5204; first and third record loads fail.'));
