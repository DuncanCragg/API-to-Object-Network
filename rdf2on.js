#!/usr/bin/node

var http = require('http'),
    url = require('url');

http.createServer(function(req, res) {

    if(req.method !== 'GET'){
        res.writeHead(400);
        res.end();
        console.log('400 '+req.method);
        return;
    }
    var path = url.parse(req.url).pathname;

    console.log('GET '+path);
    console.log(JSON.stringify(req.headers, true, 2));

    var phost = path.split('/')[1];
    var ppath = path.substring(phost.length+1);
    var hostpath = { host: phost, path: ppath };

    console.log('Request: http://' + hostpath.host + hostpath.path);

    var preq=http.request(hostpath, function(pres){
    
        console.log('HTTP/1.1 ' + pres.statusCode);
        console.log(JSON.stringify(pres.headers, true, 2));

        if(!pres.headers.link){ returnError(res,'no link header'); return; }
        var subject=null;
        var links=pres.headers.link.split(',');
        for(var i in links){ var link = links[i];
            if(link.indexOf('describedby')!= -1) subject=link.split('>')[0].substring(2);
        }
        if(!subject){ returnError(res,'no describedby link header'); return; }
    
        var data="";
        pres.setEncoding('utf8');
        pres.on('data', function (chunk) { data += chunk; });
        pres.on("end", function(){ try{ rdf2on(JSON.parse(data), subject, path, res); }catch(e){ returnError(res,e); }});
    });
    preq.on('error', function(e){ returnError(res,e); });
    preq.end();

}).listen(8888);

function returnError(res,e){
    res.writeHead(500);
    res.end();
    console.log(e);
}

function rdf2on(rdf, subject, path, res){
    var obj = { };
    var subj = rdf[subject];
    if(subj){
        var is=null;
        var types = subj['http://www.w3.org/1999/02/22-rdf-syntax-ns#type'];
        if(types){
            for(var i in types){ var type=types[i];
                if(type.value=='http://dbpedia.org/ontology/Person') is='contact';
            }
        }
        if(is=='contact') obj=rdf2contact(rdf, subject, subj, types);
    }
    returnObject(obj, path, res);
}

function rdf2contact(rdf, subject, subj, types){
    var obj = { 'is': 'contact' };
    var fullNames = subj["http://www.w3.org/2000/01/rdf-schema#label"];
    if(fullNames){ for(var i in fullNames){ var fullName = fullNames[i];
        if(fullName.lang=='en') obj.fullName = fullName.value;
    }}
    var bios = subj["http://dbpedia.org/ontology/abstract"];
    if(bios){ for(var i in bios){ var bio = bios[i];
        if(bio.lang=='en') obj.bio = bio.value;
    }}
    bios = subj["http://www.w3.org/2000/01/rdf-schema#comment"];
    if(bios){ for(var i in bios){ var bio = bios[i];
        if(bio.lang=='en') if(!obj.bio) obj.bio = bio.value; else obj.bio = [ obj.bio, bio.value ];
    }}
    return obj;
}

function returnObject(obj, path, res){

    var headers = { 'Content-Type': 'application/json' };

    headers["Access-Control-Allow-Origin"] = "*";
    headers["Access-Control-Allow-Headers"] = "X-Requested-With";

    res.writeHead(200, headers);
    res.end(JSON.stringify(obj, true, 2)+'\n');

    console.log('200 '+path);
}

String.prototype.startethWith = function(str){ return this.slice(0, str.length)==str; };
String.prototype.endethWith   = function(str){ return this.slice(  -str.length)==str; };

