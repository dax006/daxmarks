//first I need a way to validate any tests.  I guess compare it with my copy on the db.
//list or tree?  List is slower but simpler.
function getDBbs() {
    storeTree(); //refresh tree variable
    sendToPhp("getDBbs"); //it SHOULD return appropriate client ids
}

function compareAll(serverBs) { // all bookmarks as list
    //what column do we need in server results?
    if (!serverBs) {
        console.log("Error.  Server bookmarks not found?");
        return;
    }
    var slen = count(serverBs)
    var llen = count(_localTreeAssoc);
    console.log("Comparing all " + slen + " server Bookmarks with " + llen + " local bookmarks.");
    var idcol = _clientID + "_id";


    console.log(serverBs);

    //i guess for each one, check that it exists in list.  If it does, remove it.  AT the end list should be empty.
    serverBs = indexByIds(serverBs); //turn into associative array indexed by ids for fast lookup
    slen = count(serverBs)
    console.log("after turned into indexes:"+slen);
    console.log(serverBs);

    var bGen = bookmarkGenerator(_localTree); //loop through local bookmarks
    var unmatchedLocal = 0;
    localDiffs = [];
    for (localB of bGen) {
        // console.log(localB);
        //loop through serverBs, find match
        
        console.log("Comparing " + localB.title);

        // if (localB.title == "") { //its really hard to match empty strings for some reason
        //     console.log("root found.  LocalB,serverB");
        //     console.log(localB);
        //     console.log(serverBs[localB.id]);
        // }
        serverB = findMatch(serverBs, localB.id);
        //if matching id, return it, else return false
        //console.log("Matching id found:"+localB.id+" for title:"+localB.title);
        //compare to make sure match is exact, record any discrepancies
        if (!serverB) {
            console.log(localB.title + " Not found on server.  Id:" + localB.id);
            console.log(localB);
            localDiffs.push(localB);
            unmatchedLocal += 1;
            continue;
        }

        console.log("Match found:");
        console.log(serverB);

        var diffs = getDifferences(localB, serverB);
        if (diffs == false) { //if no differences
            // console.log("No differences for:"+localB.title);
            delete serverBs[serverB[idcol]]; //delete it from list - at end this should be empty
            console.log("perfect match for:" + localB.title + ", primarykey:" + serverB.primarykey + " to localId:"+localB.id+"  serverB length:" + count(serverBs));
        } else {
            //save differences, compare at the end
            if (!isSpecialNode(localB)) {
                // console.log("diffs");
                // console.log(diffs);
                localDiffs.push(diffs);
                unmatchedLocal += 1;
                //dont delete server node as it was not a perfect match
            } else {
                //don't bother with special nodes
                delete serverBs[localB.id];
                console.log("special node for:" + localB.title + "  new serverB length:" + count(serverBs));
            }
        }
    }
    //done comparing, print results
    //print unmached local
    var message = unmatchedLocal + ' unmatched local bookmarks';
    console.log(message);
    if (unmatchedLocal > 0) {
        sendStatus(message);
        console.log(localDiffs);
    }
    //print unmached server
    ulenPrev = count(serverBs);
    serverBs = removeSpecials(serverBs); //special nodes never match, just skip them
    ulen = count(serverBs);
    console.log(ulen + " ummatched serverBs after special nodes removed. Prev:"+ulenPrev);
    var message = ulen + ' unmatched server bookmarks';
    if (ulen > 0) { //i went them side by side in console
        
        console.log(serverBs);
        sendStatus(message);
    }
    if (unmatchedLocal > 0 && localDiffs[0][0]) {
        title = localDiffs[0][0].title;
        // console.log("exploring ONE unmatched local bookmark.  Title: " + title);
        // console.log(localDiffs[0]);
        // console.log("getOpsWithTitle:");
        // sendToPhp("getOpsWithTitle", title);
        // console.log("getBsWithTitle:");
        // sendToPhp("getBsWithTitle", title);
        // console.log("sending again");
        // queueOpToServer("add",localDiffs[0][0]);
    }
    // message = ulen + " Unmatched server bookmarks:";
    // console.log(message);
    // var keys = Object.keys(serverBs);
    // if (ulen > 0) {
    //     sendStatus(message);
    //     //chrome.runtime.sendMessage({ command: "status", message: serverBs });  //just shows 'object'
    //     title = serverBs[keys[0]].title;
    //     console.log(serverBs);
    //     // console.log("exploring ONE unmatched server bookmark: " + title);
    //     // console.log(serverBs[keys[0]]);
    //     // console.log("getOpsWithTitle:");
    //     // sendToPhp("getOpsWithTitle", title);
    //     // console.log("getBsWithTitle:");
    //     // sendToPhp("getBsWithTitle", title);
    // }
    if (unmatchedLocal == 0 && ulen == 0) {
        sendStatus("Perfect Match.");
    }
    console.log("Done Comparing all Bookmarks.");
}


function getBsWithTitleCont(titles) {
    console.log("Bs with title");
    console.log(titles);
}

function getOpsWithTitleCont(titles) {
    console.log("Ops with title:" + titles[0].title);
    console.log(titles);
}

function removeSpecials(arr) {
    var newarr = {}; //lol not an array, arr[13416] will create 13,000 empty entries!!
    var keys = Object.keys(arr);
    //var alen = count(arr);
    for (var key of keys) { //if thereis only one key this breaks, starts returning object properties like length
        if (isSpecialNode(arr[key])) {
            // delete arr[b];  
            //dont add it
        } else {
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
    var diffFound = false;
    //fields to check: id, parentid, title, url, index
    serverB.url = urldecode(serverB.url);
    serverB.title = decodeEntities(serverB.title);
    if (!localB.parentFolders) {
        localB.parentFolders = getParentFolders(localB);
    }
    localB = fixSpecialFolders(localB);
    serverB = fixSpecialFolders(serverB);



    if (localB.parentId && localB.parentId != serverB[parentidcol]) {
        localB.difffield = "parentId";
        localB.serverVal = serverB[parentidcol]
        diffFound = true;
    };
    if (localB.title != serverB.title) {

        localB.difffield = "title";
        localB.serverVal = serverB.title;
        diffFound = true;
    }
    if (localB.url && localB.url != serverB.url) { //folders dont have urls
        localB.difffield = "url";
        localB.serverVal = serverB.url;
        diffFound = true;
    }
    if (localB.parentFolders != serverB.parentFolders) { //folders dont have urls
        localB.difffield = "parentFolders";
        localB.serverVal = serverB.parentFolders;
        diffFound = true;
    }
    // //index is usually off by 1
    // if(localB.index.toString() != serverB.folderindex){
    //  diff = {id: localB.id, title:localB.title, field:"index", serverVal:serverB.folderindex, localVal: localB.index.toString()};
    //  diffs.push(diff); 
    // }
    if (diffFound) {
        return localB;
    } else {
        // console.log(diffs.length + " diffs found in "+localB.id);
        return false;
    }
}


//undo php HTMLentities()  //https://stackoverflow.com/questions/5796718/html-entity-decode
var decodeEntities = (function() {
    // this prevents any overhead from creating the object each time
    var element = document.createElement('div');

    function decodeHTMLEntities(str) {
        if (str && typeof str === 'string') {
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
        if(!serverId){  //use the original, backupid
            serverId = serverB.originalOpId;
        }
        newArr[serverId] = serverB;
    }
    return newArr;
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
    var r = Math.floor(Math.random() * blen); //random from blen
    var node = blist[r];
    if (!node) {
        console.log("randomnode fail. " + r);
        console.log(blist);
    }
    return node;;
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
    console.log("randomDelete() " + node.id);
    sendStatus("delete");
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
    sendStatus("move");
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
    sendStatus("rename");
}

function randomAdd(folders, blist) { //modify in place if success
    var callback = function(result) {
        if (chrome.runtime.lastError) { //trap errors
            console.log(chrome.runtime.lastError.message);
        }
    }
    var node1 = randomFolder(folders); //find a random parentId to add to
    var node2 = randomFolder(folders); //use duplicate names, see how confused we can make the program
    var blen = folders.length;
    var r = Math.floor(Math.random() * blen); //random into from 0 to blen
    //var newtitle = "randomTitle" + r;
    var newtitle = node2.title + r;
    console.log("random add " + newtitle + " to " + node1.title);
    if (Math.random() * 10 < 2) { // 1 in 10
        chrome.bookmarks.create({ parentId: node1.id, title: node1.title + newtitle }, callback); //create a folder
    } else {
        chrome.bookmarks.create({ parentId: node1.id, title: newtitle, url: "http://someURL.com" }, callback);
    }
    sendStatus("add");
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
    // console.log(blist);
    blist = deleteSpecial(blist);
    // console.log(blist);
    var i;
    var numOps = 1;
    var r = Math.ceil(Math.random() * 4); //random int from 1 to 4.
    //   console.log("randomtest #"+r);
    //  // for (i = 0; i < numOps; i++) {
    //     randomDelete(blist);
    //     randomAdd(folders);
    //     randomMove(blist, folders);
    //     randomRename(blist);
    // }
    if (r == 1) {
        randomDelete(blist);
    } else if (r == 2) {
        randomAdd(folders);
    } else if (r == 3) {
        randomMove(blist, folders);
    } else if (r == 4) {
        randomRename(blist);
    }
    //get all bookmarks and compare differences
    chrome.bookmarks.getTree(test1Cont);
}

function deleteSpecial(blist) {
    newlist = [];
    var blen = blist.length;
    for (i = 0; i < blen; i++) {
        node = blist[i];
        if (node.id == '0' || node.id == '1' || node.id == '2' || node.id == 'root________' || node.id == 'toolbar_____' || node.id == 'unfiled_____' || node.id == 'menu________' || node.id == 'mobile______') {
            //skip
        } else {
            newlist.push(node);
        }
    }
    return newlist;
}

function test1Cont(tree) { //compare results of server with local
    _localTree = tree;
    //getDBbs(); //goes straight into compare
}

function bigText() {
    var postUrl = 'http://localhost/daxmarks/listener2.php';
    var xhr = new XMLHttpRequest();
    xhr.open('POST', postUrl, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState == XMLHttpRequest.DONE) {
            recieveFromPhp(xhr);
        }
    };
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.withCredentials = false;
    // Send the request and set status
    console.log("SENDING: " + outstring.length + " characters.");
    xhr.send(outstring);
}

function test3() {
    console.log("test3()");
    var tree = createTestTree();
    var bgen = testGenerator(_localTree);
    for (node of bgen) {
        //console.log("yielded:"+node.id);
        console.log(node.id);
    }
}
// //https://stackoverflow.com/questions/2282140/whats-the-yield-keyword-in-javascript/20859859
// function * foo(x) {
//     for(i=0;i<10;i++) {
//         x = x * 2;
//         console.log(x);
//         yield x;
//     }
// }
function* testGenerator(node) {
    //if its an array
    if (!node) return;
    if (node.id) {
        console.log(node.id);
        yield node; //execution should break here
    }
    var nlen = node.length;
    for (var i = 0; i < nlen; i++) {
        yield* testGenerator(node[i]);
    }
    if (node.children) {
        yield* testGenerator(node.children);
    }
}

function createTestTree() {
    var tree = {};
    tree['id'] = 1;
    tree['children'] = [];
    tree.children[0] = {};
    tree.children[0]['id'] = 2;
    tree.children[1] = {};
    tree.children[1]['id'] = 3;
    tree.children[1]['children'] = [];
    tree.children[1]['children'][0] = {};
    tree.children[1]['children'][0]['id'] = 4;
    console.log(tree);
    return tree;
}

function renametest() {
    function callback(result) {
        // console.log("rename callback.");
        // console.log(result);
        if (chrome.runtime.lastError) {
            console.log("renametest Failure: " + chrome.runtime.lastError.message);
        }
        processNextOp();
    }
    changeObj = {
        title: "Manually entered title",
    }
    // console.log("calling rename");
    // console.log(changeObj);
    chrome.bookmarks.update("5621", changeObj, callback); //why 
}

function test4() {
    //add, move, delete, add
    chrome.bookmarks.create({ parentId: "1", title: "B\\'s", url: "http://0.0.0.1" }, function(result) {
        chrome.bookmarks.move(result.id, { parentId: "2" });
        chrome.bookmarks.remove(result.id);

    });
    chrome.bookmarks.create({ parentId: "1", title: "B\\'s", url: "http://0.0.0.1" },function(B){

        chrome.bookmarks.create({ parentId: "2", title: "F\\'s" },function(folder){
            //move bookmark into folder
            chrome.bookmarks.move(B.id, { parentId: folder.id });
        });  //a folder

    });

    
}

