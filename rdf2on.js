#!/usr/bin/node

var http = require('http'),
    url = require('url');

var localport  = 8888;
var api2onport = process.env.PORT || localport;
var runningLocally = (api2onport==localport);
var hostport = (runningLocally? 'http://localhost:'+localport: 'http://api2.the-object.net');

var verboselogging = false;
var logging = true;

http.createServer(function(req, res) {

    if(req.method !== 'GET'){ returnNotSupported(req,res); return; }

    var path = url.parse(req.url).pathname;

    if(logging) console.log('GET '+path);
    if(verboselogging) console.log(JSON.stringify(req.headers, true, 2));

    var phost = path.split('/')[1];
    var ppath = path.substring(phost.length+2);

    if(phost=='dbpedia') dbpedia(req, res, ppath);
    else
    if(phost=='twitter') twitter(req, res, ppath);
    else returnError(res, phost+' is not a supported API'); 

}).listen(api2onport);

// -------------------------------------------------------------

function dbpedia(req, res, path){

    var hostpath = { host: 'dbpedia.org', path: '/data/'+path };

    if(logging) console.log('Request: http://' + hostpath.host + hostpath.path);

    var preq=http.request(hostpath, function(pres){

        if(logging) console.log('HTTP/1.1 ' + pres.statusCode);
        if(verboselogging) console.log(JSON.stringify(pres.headers, true, 2));

        if(!pres.headers.link){ returnError(res,'no link header'); return; }
        var subject=null;
        var links=pres.headers.link.split(',');
        for(var i in links){ var link = links[i];
            if(link.indexOf('describedby')!= -1) subject=link.split('>')[0].substring(2);
        }
        if(!subject){ returnError(res,'no describedby link header'); return; }
    
        var data='';
        pres.setEncoding('utf8');
        pres.on('data', function(chunk) { data += chunk; });
        pres.on('end',  function(){ try{ rdf2on(JSON.parse(data), subject, path, res); }catch(e){ returnError(res,e); }});
    });
    preq.on('error', function(e){ returnError(res,e); });
    preq.end();
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
                if(type.value=='http://dbpedia.org/ontology/Place' ) is='contact';
            }
        }
        if(is=='contact') obj=rdf2contact(rdf, subject, subj, types);
    }
    returnObject(obj, path, res);
}

function rdf2contact(rdf, subject, subj, types){
    var obj = { 'is': 'contact' };
    getEnglishFromListIfPoss(obj, 'fullName', subj, 'http://www.w3.org/2000/01/rdf-schema#label');
    getEnglishFromListIfPoss(obj, 'bio',      subj, 'http://dbpedia.org/ontology/abstract');
    getEnglishFromListIfPoss(obj, 'bio',      subj, 'http://www.w3.org/2000/01/rdf-schema#comment');
    getEnglishFromListIfPoss(obj, 'photo',    subj, 'http://xmlns.com/foaf/0.1/depiction');
    getEnglishFromListIfPoss(obj, 'parents',  subj, 'http://dbpedia.org/ontology/parent');
    return obj;
}

function getEnglishFromListIfPoss(obj, tag, subj, label){
    var list = subj[label];
    if(!list || list.length==0) return;
    for(var i in list){ var item = list[i];
        if(item.lang=='en' || !item.lang){
            var fixedItem = fixup(item.value);
            if(!obj[tag]){
                obj[tag] = fixedItem;
            }
            else if(obj[tag].startethWith(fixedItem)){
            }
            else if(fixedItem.startethWith(obj[tag])){
                obj[tag] = fixedItem;
            }else{
                obj[tag] = [ obj[tag], fixedItem ];
            }
        }
    }
}

var dbpediaprefix  = 'http://dbpedia.org/resource/';
var dbpedia2prefix = hostport+'/dbpedia/'

function fixup(s){
    if(s.startethWith(dbpediaprefix)) return dbpedia2prefix+s.substring(dbpediaprefix.length)+'.json';
    return s;
}

// -------------------------------------------------------------

function twitter(req, res, path){

    var hostpathuser = { host: 'api.twitter.com', path: '/1/users/show/'+path };

    if(logging) console.log('Request: http://' + hostpathuser.host + hostpathuser.path);

    var preq=http.request(hostpathuser, function(pres){

        if(logging) console.log('HTTP/1.1 ' + pres.statusCode);
        if(verboselogging) console.log(JSON.stringify(pres.headers, true, 2));

        var data='';
        pres.setEncoding('utf8');
        pres.on('data', function(chunk) { data += chunk; });
        pres.on('end',  function(){ try{ twit2onuser(JSON.parse(data), path, res); }catch(e){ returnError(res,e); }});
    });
    preq.on('error', function(e){ returnError(res,e); });
    preq.end();
}

function twit2onuser(json, path, res){

    var name = path.substring(0,path.length-5);
    var tpath;
    var match = RegExp('[0-9]\+').exec(name);
    if(match) tpath = '/1/friends/ids.json?cursor=-1&user_id='+name;
    else      tpath = '/1/friends/ids.json?cursor=-1&screen_name='+name;

    var hostpathfoll = { host: 'api.twitter.com', path: tpath };

    if(logging) console.log('Request: http://' + hostpathfoll.host + hostpathfoll.path);

    var preq=http.request(hostpathfoll, function(pres){

        if(logging) console.log('HTTP/1.1 ' + pres.statusCode);
        if(verboselogging) console.log(JSON.stringify(pres.headers, true, 2));

        var data='';
        pres.setEncoding('utf8');
        pres.on('data', function(chunk) { data += chunk; });
        pres.on('end',  function(){ try{ twit2onfoll(json, JSON.parse(data), path, res); }catch(e){ returnError(res,e); }});
    });
    preq.on('error', function(e){ returnError(res,e); });
    preq.end();
}

function twit2onfoll(userjson, folljson, path, res){

    var obj = {
        'is': 'contact',
        'fullName': userjson.name,
        'photo': userjson.profile_image_url,
        'location': userjson.location,
        'webURL': [ userjson.url, 'http://twitter.com/'+userjson.screen_name ],
        'bio': userjson.description,
        'following': followingList(folljson.ids)
    };
    if(userjson.status) obj.status = userjson.status.text,
    returnObject(obj, path, res);
}

var twitter2prefix = hostport+'/twitter/'

function followingList(list){
    r = [];
    for(var i in list){ var id = list[i];
        r.push(twitter2prefix+id+'.json');
        if(i==4) break;
    }
    return r;
}

// -------------------------------------------------------------

function returnObject(obj, path, res){

    var headers = { };
    headers['Date'] = utcDate();
    headers['Server'] = 'API-to-Object-Network';
    headers['Content-Type'] = 'application/json';
    headers['Cache-Control'] = 'max-age=1800';
    headers['Access-Control-Allow-Origin'] = '*';
    headers['Access-Control-Allow-Headers'] = 'X-Requested-With';

    res.writeHead(200, headers);
    res.end(JSON.stringify(obj, true, 2)+'\n');

    console.log('200 '+path);
}

function returnNotSupported(req,res){
    res.writeHead(400);
    res.end();
    console.log('400 '+req.method);
}

function returnError(res,e){
    res.writeHead(500);
    res.end();
    console.log('500 '+e);
}

// -------------------------------------------------------------
// Thanks to Mark Nottingham
var dateCache;
function utcDate(){
    if(!dateCache){
        var d=new Date();
        dateCache = d.toUTCString();
        setTimeout(function(){ dateCache=undefined; }, 1000-d.getMilliseconds());
    }
    return dateCache;
}

// Thanks to .. um .. StackOverflow..
String.prototype.startethWith = function(str){ return this.slice(0, str.length)==str; };
String.prototype.endethWith   = function(str){ return this.slice(  -str.length)==str; };

// -------------------------------------------------------------

