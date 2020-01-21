//first I need a way to validate any tests.  I guess compare it with my copy on the db.
//list or tree?  List is slower but simpler.
function getDBbs() {
    storeTree();  //refresh tree variable
    sendToPhp("getDBbs");  //it SHOULD return appropriate client ids
}

function compareAll(serverBs) { // all bookmarks as list
    //what column do we need in server results?
    console.log("Comparing all Bookmarks.");
    var idcol = _clientID + "_id";
    serverBs = indexByIds(serverBs); //turn into associative array indexed by ids for fast lookup
    console.log(serverBs);
    //delete serverBs[0];  //root
    // console.log(typeof(serverBs));
    // console.log(serverBs);
    //i guess for each one, check that it exists in list.  If it does, remove it.  AT the end list should be empty.
    // console.log(_localTree);
    var bGen = bookmarkGenerator(_localTree); //loop through local bookmarks
    var unmatchedLocal = 0;
    for (localB of bGen) {
        // console.log(localB);
        //loop through serverBs, find match


        // if(localB.title == "Bookmarks Menu"){
        //     console.log("Bookmarks Menu found.  LocalB,serverB");
        //     console.log(localB);
        //     console.log(serverBs[localB.id]);

        // }

        if (serverB = findMatch(serverBs, localB.id)) { //if matching id, return it, else return false
            //compare to make sure match is exact, record any discrepancies
            var diffs = getDifferences(localB, serverB);
            if (diffs == false) { //if no differences
                delete serverBs[serverB[idcol]]; //delete it from list - at end this should be empty
            } else {
                //save differences, compare at the end
                if(!isSpecialNode(localB)){
                    console.log("diffs");
                    console.log(diffs);
                    unmatchedLocal += 1;
                }else{
                    //don't bother with special nodes
                    delete serverBs[localB.id];

                }
            }
        } else {
            console.log(" error.  Not found on server.  Id:" + localB.id);
            console.log(localB);

            unmatchedLocal += 1;
        }
    }


    //done comparing, print results
    var message = unmatchedLocal +' unmatched local bookmarks';
    if(unmatchedLocal > 0){
        chrome.runtime.sendMessage({ command: "status", message: message });
    }
    console.log(message);

    serverBs = removeSpecials(serverBs);  //special nodes never match, just skip them
    var ulen = Object.keys(serverBs).length;
    message = ulen + " Unmatched server bookmarks:";
    if(ulen > 0){
        chrome.runtime.sendMessage({ command: "status", message: message });
        //chrome.runtime.sendMessage({ command: "status", message: serverBs });  //just shows 'object'
        
    }
    console.log(message);
    console.log(serverBs);
    
    if(unmatchedLocal == 0 && ulen == 0){
        sendStatus("Perfect Match.");
    }

    console.log("Done Comparing all Bookmarks.");
}

function removeSpecials(arr){
    newarr = [];
    var keys = Object.keys(arr);
    for(var key of keys){
        if(isSpecialNode(arr[key])){
            // delete arr[b];  
            //dont add it
        }else{
            newarr[key] = arr[key];
        }
    }
    return newarr;
}

function findMatch(serverBs, id) { //looping was too slow
    
    return serverBs[id];
}

function getDifferences(localB, serverB) { //compares two bookmarks, returns any differences - any difference meanas they don't match
    var idcol = _clientID + "_id";
    var parentidcol = _clientID + "_parentId";
    var serverId = serverB[idcol];
    var serverParentId = serverB[parentidcol];
    var diffs = [];
    //fields to check: id, parentid, title, url, index
    serverB.url = urldecode(serverB.url);
    serverB.title = decodeEntities(serverB.title);

    if (localB.parentId && localB.parentId != serverB[parentidcol]) {
        diff = { id: localB.id, title: localB.title, field: "parentId", serverVal: serverB[parentidcol], localVal: localB.parentId };
        diffs.push(diff);
    }
    if (localB.title != serverB.title) {
        diff = { id: localB.id, title: localB.title, field: "title", serverVal: serverB.title, localVal: localB.title };
        diffs.push(diff);
    }
    if (localB.url && localB.url != serverB.url) { //folders dont have urls
        diff = { id: localB.id, title: localB.title, field: "url", serverVal: serverB.url, localVal: localB.url };
        diffs.push(diff);
    }
    // //index is usually off by 1
    // if(localB.index.toString() != serverB.folderindex){
    //  diff = {id: localB.id, title:localB.title, field:"index", serverVal:serverB.folderindex, localVal: localB.index.toString()};
    //  diffs.push(diff); 
    // }
    if (diffs.length == 0) {
        return false;
    } else {
        // console.log(diffs.length + " diffs found in "+localB.id);
    }
    return diffs;
}

//undo php HTMLentities()  //https://stackoverflow.com/questions/5796718/html-entity-decode
var decodeEntities = (function() {
  // this prevents any overhead from creating the object each time
  var element = document.createElement('div');

  function decodeHTMLEntities (str) {
    if(str && typeof str === 'string') {
      // strip script/html tags
      str = str.replace(/<script[^>]*>([\S\s]*?)<\/script>/gmi, '');
      str = str.replace(/<\/?\w(?:[^"'>]|"[^"]*"|'[^']*')*>/gmi, '');
      element.innerHTML = str;
      str = element.textContent;
      element.textContent = '';
    }

    return str;
  }

  return decodeHTMLEntities;
})();



function indexByIds(serverBs) { //turn a list into associative array indexed by id
    var idcol = _clientID + "_id";
    newArr = {};
    var slen = serverBs.length;
    var i, serverB, serverId;
    for (i = 0; i < slen; i++) {
        serverB = serverBs[i];
        serverId = serverB[idcol];
        newArr[serverId] = serverB;
    }
    return newArr;
}

function tree2list(tree) { //takes in bookmarks tree, spits out list
    var list = [];
    var bgen = bookmarkGenerator(tree);
    var node;
    for (node of bgen) {
        list.push(node);
    }
    return list;
}

function getFolders(blist) {
    var folders = [];
    var blen = blist.length;
    var i, node;
    for (i = 0; i < blen; i++) {
        node = blist[i];
        if (node.url) {
            continue;
        } else {
            folders.push(node);
        }
    }
    return folders;
}

function randomNode(blist) { //list of bookmark nodes
    var blen = blist.length;
    var r = Math.floor(Math.random() * (blen - 3)) + 3; //random into from 3 to blen
    return blist[r];
}

function randomDelete(blist) {
    var node = randomNode(blist);
    if (!node) return;
    var callback = function(result) {
        if (chrome.runtime.lastError) { //trap errors
            console.log(chrome.runtime.lastError.message);
        }
        if (result) {
            var ind = blist.indexOf(node);
            delete blist[ind]; //remove it from our list so we don't keep trying to add it  - we should delete all children too!  ah well
        }
        return;
    }
    if (!node.url) { //if its a folder
        chrome.bookmarks.removeTree(node.id, callback);
    } else {
        chrome.bookmarks.remove(node.id, callback);
    }
    console.log("randomDelete() " +node.id);
}

function randomMove(blist, folders) {
    var node1 = randomNode(blist);
    if (!node1) return;
    var node2 = randomFolder(folders);
    chrome.bookmarks.move(node1.id, { parentId: node2.id }, function(result) {
        if (chrome.runtime.lastError) { //trap errors
            console.log(chrome.runtime.lastError.message);
        }
        return;
    });
    console.log("random move to " + node2.title);
}

function randomRename(blist) {
    var node1 = randomNode(blist);
    if (!node1) return;
    var title = node1.title;
    var tlen = title.length;
    var r = Math.floor(Math.random() * tlen); //split string at random spot
    var newtitle = title.substring(r, tlen) + title.substring(0, r);
    console.log("random rename " + newtitle);
    chrome.bookmarks.update(node1.id, { title: newtitle }, function(result) {
        if (chrome.runtime.lastError) { //trap errors
            console.log(chrome.runtime.lastError.message);
        }
        return;
    });
}

function randomAdd(folders,blist) { //modify in place if success
    var callback = function(result) {
        if (chrome.runtime.lastError) { //trap errors
            console.log(chrome.runtime.lastError.message);
        }
    }
    var node1 = randomFolder(folders); //find a random parentId to add to
    var blen = folders.length;
    var r = Math.floor(Math.random() * blen); //random into from 0 to blen
    var newtitle = "randomTitle" + r;
    console.log("random add " + newtitle + " to " +node1.title);
    if (Math.random() * 10 < 2) { // 1 in 10
        chrome.bookmarks.create({ parentId: node1.id, title: node1.title + newtitle }, callback); //create a folder
    } else {
        chrome.bookmarks.create({ parentId: node1.id, title: newtitle, url: "http://someURL.com" }, callback);
    }
}

function randomFolder(folders) {
    var flen = folders.length;
    var r = Math.ceil(Math.random() * (flen - 1)); //random int from 1 to blen.   0 is the root folder
    return folders[r];
}

function test1() {
    console.log("Starting test 1");
    // if (!_email) _email = "dax006@gmail.com";
    // if (!_password) _password = "166971115959308191453821801565552831-1083056243-11208458921351984477-413745247-3616111591342510226-1796037916430843167-4870728422084288071-10289080641592557305";

    var blist = tree2list(_localTree);
    var folders = getFolders(blist);
    blist = deleteSpecial(blist);
    var i;
    var numOps = 1;
    var r = Math.ceil(Math.random() * 4); //random int from 1 to 4.

    // for (i = 0; i < numOps; i++) {
    //     randomDelete(blist);
    //     randomAdd(folders);
    //     randomMove(blist, folders);
    //     randomRename(blist);
    // }

    if(r == 1){
        randomDelete(blist);
    }else if (r == 2){
        randomAdd(folders);
    }else if (r == 3){
        randomMove(blist, folders);
    }else if (r == 4){
        randomRename(blist);
    }



    //get all bookmarks and compare differences
    chrome.bookmarks.getTree(test1Cont);
}

function deleteSpecial(blist){
    newlist = [];
    var blen = blist.length;
    for (i = 0; i < blist; i++) {
        node = blist[i]; 
        if(node.id == '0' || node.id == '1' || node.id == '2' || node.id == 'root________'  || node.id == 'toolbar_____'   || node.id == 'unfiled_____'  || node.id == 'menu________'   || node.id == 'mobile______'){
                //skip
        }else{
            newlist.push(node);
        }
    }
    return newlist;
}

function test1Cont(tree) { //compare results of server with local
    _localTree = tree;
    getDBbs(); //goes straight into compare
}