const http = require('http');
const https =require('https');
const qs = require('querystring');
const options = {
    key: fs.readFileSync(path.join(__dirname,'./keys/key.pem')),
    cert: fs.readFileSync(path.join(__dirname,'./keys/server.crt'))
};
const errParamTips=`参数不正确,正确(GET)请求方式：[ http://127.0.0.1/_mtproxy_/addproxy?pattern=*.test.*.com&dest=qa.xxx.com ],非浏览器请求且含特殊字符请使用encodeURIComponent编码`
module._proxyMaps=module._proxyMaps||[];
module.exports=function(opt={}){
  opt=Object.assign({
    port:80,
    safe:false
  },opt);
  let proxy=(req, res, protocol)=>{
    let send=(response)=>{
      let responseText="";
      if(Object.prototype.toString.call(response)==="[object Object]"){
        responseText=JSON.Stringify(response);
        res.setHeader('Content-Type', 'application/json');
      }
      res.end(responseText)
    };
    let proxyMaps=module._proxyMaps,url=req.url;
    if(/^\/_mtproxy_\/setproxy/.test(url)){
      let queryStr=url.split("?")[1];
      if(!queryStr) return send({status:-1,msg:errParamTips});
      let {pattern,dest}=qs.parse(queryStr);
      if(!pattern || !/^[\w\-\.\:]+$/.test(dest)){return send({status:-1,msg:errParamTips})}
      let reg=new RegExp(pattern.replace(/([^\w\*])/g,"\\$1").replace(/\*/g,".*"),"i")
      let oldIndex=proxyMaps.findIndex((item)=>{return item.pattern===pattern});
      if(oldIndex!=-1){
        proxyMaps[oldIndex]={pattern,dest};
      }else{
        proxyMaps.push({pattern,dest,reg});
      }
      send({status:0,msg:`${oldIndex==-1?"新增":"更新"}一条规则:[${pattern+":"+dest}]`});
      return;
    }
    if(/^\/_mtproxy_\/getproxy/.test(url)){
      send({status:0,data:proxyMaps})
      return;
    }
    let host=req.headers.host;
    for (var i = 0; i < proxyMaps.length; i++) {
      if(proxyMaps[i].reg.test(host)){
        let dest=proxyMaps[i].dest.split(":");
        req.setHeader('Host',dest);
        req.pipe(protocol.request({host:dest[0],port:dest[1]||80,path:url}),{end:true}).pipe(res);
        res.end();
        return;
      }
    }
  }
  let serve=(server,port)=>{
    server.on("error",(err)=>{
      if(err.message.indexOf("EADDRINUSE")!=-1){
        http.request("http://127.0.0.1:"+opt.port+"/_mtproxy_/getproxy",(response)=>{
          res.setEncoding('utf8');
          let body="";
          res.on('data', (chunk) => {
            body+=chunk;
          });
          res.on('end', () => {
            try{
              if(JSON.parse(body).status!=0) throw Error('EADDRINUSE');
            }catch(e){
              server.emit("error",err)
            }
            server.listen(port)
          });
        }).on("error",()=>{
          server.emit("error",err)
        })
      }
    }
  }
  let httpServer=http
    .createServer((req,res)=>{
      proxy(req,res,http)
    })
    .on(serve,opt.port);
  if(opt.safe){
    let httpsServer=https
      .createServer(options,(req,res)=>{
        proxy(req,res,https)
      })
      .on(serve,opt.safe);
  }
}