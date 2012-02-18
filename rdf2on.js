#!/usr/bin/node

var http = require('http'),
    url = require('url'),
    jsdom = require('jsdom');

var localport  = 8888;
var api2onport = process.env.PORT || localport;
var runningLocally = (api2onport==localport);
var hostport = (runningLocally? 'http://localhost:'+localport: 'http://api2.the-object.net');

var verboselogging = false;
var logging = true;

http.createServer(function(req, res) {

    if(req.method !== 'GET'){ returnNotSupported(req,res); return; }

    var path = url.parse(req.url).pathname;

    if(logging) console.log('---------------\nGET '+path);
    if(verboselogging) console.log(JSON.stringify(req.headers, true, 2));

    if(req.headers["cache-control"] != "no-cache"){
        var obj=cacheGet(path); if(obj){ returnObject(obj, path, res); return; }
    }

    var apiname = path.split('/')[1];
    var id = path.substring(apiname.length+2);

    if(apiname=='dbpedia') dbpedia(path, res, id);
    else
    if(apiname=='twitter') twitter(path, res, id);
    else
    if(apiname=='lanyrd' ) lanyrd(path, res, id);
    else{
        returnError(res, apiname+' is not a supported API'); 
    }

}).listen(api2onport);

// -------------------------------------------------------------

function dbpedia(path, res, id){

    var hostpath = { host: 'dbpedia.org', path: '/data/'+id };

    if(logging) console.log('request: http://' + hostpath.host + hostpath.path);

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
    if(!list) return;
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

function twitter(path, res, id){

    var hostpath = { host: 'api.twitter.com', path: '/1/users/show/'+id };

    if(logging) console.log('request: http://' + hostpath.host + hostpath.path);

    var preq=http.request(hostpath, function(pres){

        if(logging) console.log('HTTP/1.1 ' + pres.statusCode);
        if(verboselogging) console.log(JSON.stringify(pres.headers, true, 2));

        var data='';
        pres.setEncoding('utf8');
        pres.on('data', function(chunk) { data += chunk; });
        pres.on('end',  function(){ try{ twit2onuser(JSON.parse(data), id, path, res); }catch(e){ returnError(res,e); }});
    });
    preq.on('error', function(e){ returnError(res,e); });
    preq.end();
}

function twit2onuser(json, id, path, res){

    var name = id.substring(0,id.length-5);
    var tpath;
    var match = RegExp('[0-9]\+').exec(name);
    if(match) tpath = '/1/friends/ids.json?cursor=-1&user_id='+name;
    else      tpath = '/1/friends/ids.json?cursor=-1&screen_name='+name;

    var hostpath = { host: 'api.twitter.com', path: tpath };

    if(logging) console.log('request: http://' + hostpath.host + hostpath.path);

    var preq=http.request(hostpath, function(pres){

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

var lanyrd2prefix = hostport+'/lanyrd'

function lanyrd(path, res, id){

    if(id.startethWith('venue')){ returnError(res,'no venues!'); return; }

    var hostpath = { host: 'lanyrd.com', path: '/'+id.substring(0,id.length-5)+'/' };

    if(logging) console.log('request: http://' + hostpath.host + hostpath.path);

    var preq=http.request(hostpath, function(pres){

        if(logging) console.log('HTTP/1.1 ' + pres.statusCode);
        if(verboselogging) console.log(JSON.stringify(pres.headers, true, 2));

        var data='';
        pres.setEncoding('utf8');
        pres.on('data', function(chunk) { data += chunk; });
        pres.on('end',  function(){ try{ lany2onevent(data, id, path, res); }catch(e){ returnError(res,e); }});
    });
    preq.on('error', function(e){ returnError(res,e); });
    preq.end();
}

function lany2onevent(eventhtml, id, path, res){

    var eventjson = { 'is': 'event' };
    var html = eventhtml.replace('icon twitter','twitter-url');

    jsdom.env({ html: html}, function(err, window){ var doc = window.document;

                  putTextByClass(eventjson, 'title',   doc, 'summary');
                  putTextByClass(eventjson, 'content', doc, 'tagline');
                  putAttrByClass(eventjson, 'start',   doc, 'dtstart', 'title');
                  putAttrByClass(eventjson, 'end',     doc, 'dtend',   'title');
                  putLinkByClass(eventjson, 'webURL',  doc, 'website');
                  putLinkByClass(eventjson, 'webURL',  doc, 'twitter-url');
                  putLinkByClass(eventjson, 'webURL',  doc, 'twitter-search');

                  var attendees=getByClass(doc, 'user-list');
                  if(attendees){
                      var list=attendees.getElementsByTagName('li');
                      if(list.length) eventjson.attendees=attendeeList(list);
                  }
                  var venue=doc.getElementsByClassName('venue');
                  if(venue.length){
                      var link;
                      var h3=getByTag(venue[0],'h3');
                      if(h3){ var a=getByTag(h3,'a');
                          if(a) link=lanyrd2prefix+a.getAttribute('href')+'venue.json'
                      }
                      var pp=getByTag(venue[0],'p',1);
                      if(pp){ var addr=pp.textContent;
                          if(addr) addToObject(eventjson, 'location', { 'is': 'contact', 'address': { 'street': addr.trim() }, '%more': link } );
                      }
                  }
    });

    returnObject(eventjson, path, res);
}

function attendeeList(list){
    r = [];
    for(var i in list){ var li = list[i];
        var a=li.getElementsByTagName('a');
        if(!a.length) continue;
        var l=a[0].getAttribute('href');
        if(!l) continue;
        var t=l.substring(9,l.length-1);
        r.push(twitter2prefix+t+'.json');
        if(i==4) break;
    }
    return r;
}

// -------------------------------------------------------------

function getByTag(el,t,n){
    var e=el.getElementsByTagName(t);
    if(!e.length) return null;
    return e[n? n: 0];
}

function getByClass(doc,c){
    var e=doc.getElementsByClassName(c);
    if(!e.length) return null;
    return e[0];
}

function getLinkByClass(doc,c){
    var e=getByClass(doc,c);
    if(!e) return null;
    return e.getAttribute('href');
}

function putTextByClass(o,t,doc,c){
    var e=getByClass(doc,c);
    if(!e) return o;
    var x=e.textContent;
    if(!x) return o;
    addToObject(o,t,x);
    return o;
}

function putLinkByClass(o,t,doc,c){
    var l=getLinkByClass(doc,c);
    if(!l) return o;
    addToObject(o,t,l);
}

function putAttrByClass(o,t,doc,c,a){
    var e=getByClass(doc,c);
    if(!e) return o;
    var v=e.getAttribute(a);
    if(!v) return o;
    addToObject(o,t,v);
}

function addToObject(o,t,v){
    if(o[t]===undefined) o[t]=v;
    else
    if(o[t].constructor===String) o[t] = [ o[t], v ]
    else
    if(o[t].constructor===Array) o[t].push(v);
    else
       o[t]=v;
    return o;
}

// -------------------------------------------------------------

function returnObject(obj, path, res){

    cachePut(path, obj);

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

var cache = {};
var fifo  = [];

function cacheGet(path){
    var hit = cache[path];
    if(hit) console.log('cache hit for '+path);
    return hit;
}

function cachePut(path, obj){
    cache[path]=obj;
    var i = fifo.indexOf(path);
    if(i!= -1) fifo.splice(i, 1);
    fifo.push(path);
    var cacheSize = Object.keys(cache).length;
    if(cacheSize!=fifo.length) console.log('cache != fifo: '+cacheSize+'!='+fifo.length);
    if(fifo.length==100){
        var drop=fifo.shift();
        delete cache[drop];
        console.log('cache full, dropped '+drop);
    }
}

// -------------------------------------------------------------
// Thanks to Mark Nottingham for this nice data cache
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

