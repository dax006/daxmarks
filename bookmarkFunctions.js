
var pND = true;  //print node details
pND = false;  //print node details


// all the globals
var bGen;  //bookmark generator
var old2new = {};
var oldTitlesMap = {};  //store old Ids with title
var newTitlesMap = {};  //store current Ids with title
var browserName;
var localTree;  //local data
var serverTree;  //server data
var localTreeCount = 0;
var serverTreeCount = 0;
var rootId;
var bookmarksBarId;
var otherBookmarksId;
var bookmarksMenuId;
var mobileBookmarksId;

var duplicates = 0;
var failures = 0;
var successes = 0;
var skipped = 0;
var isListenersOn = false;  //turning on or off the actual listeners is aysynconrous and leads to bad things, so I use a boolean
var deleteCount = 0;
var deleteCallbackCount = 0;
var deleting = 0;
var createCount = 0;
var createCallbackCount = 0;
var serverUnique;
var localUnique;
var movedNodes;  //nodes that were moved (index is different than server)
var doBeforeStuffCallback;
var email;
var password;
var movedQueue = 0;  //do not call doCleanup() and restore listeners until all bookmark.move callbacks have completed
var moved = 0;

function duplicateCheck(node){

	 var callback = function(result){

	  if (chrome.runtime.lastError) {
       // console.log("duplicate Failure: " + chrome.runtime.lastError.message + " " + id);
    }


    var matchingResult;
    if(matchingResult =  isSameParent(node, result)){
    	
    	var curId = matchingResult.id;
    	newTitlesMap[curId] = matchingResult.title;
    	old2new[node.id] = curId;	  //globally store any id changes - but what if there are multiple matches???  We need to check parent

      if (pND) console.log(node.title + " already exists. "+ node.id +" becomes " + curId + ".");


   //   checkIndex(node, matchingResult);  //syncs the order of bookmarks


	  	nextBookmark(); //process next bmark
       
    } else{  //no duplicates found
    	//also check if parent matches - its possible to have identical bookmarks in different folders
    	
    	 	createBookmark(node); 
    	
    }
  }
 
  var searchObj = {
  	url: node.url,
  	title: node.title
  };


  try{
  	chrome.bookmarks.search(searchObj, callback);
  }catch(e){
    nextBookmark();
  }



}


function isSameParent(node, result){
  if(!result || result.length == 0) return false;
  var origPId = node.parentId;
  var rlen = result.length;
  var i;
  


  for(i = 0; i < rlen; i++){
    //searching for an empty url will still return results with a url - we don't want that so we have to manually check the url too
      if(node.url != result[i].url) continue;

      var curPId = result[i].parentId;  //current parent id
      var newPId = old2new[origPId];  //new parent id
      if (newPId == curPId) return result[i];
  }

  
  //console.log("Is same parent?  orig: " + origPId + " current: " + curPId + " old2new: " + newPId);

  
  return false;

}



// function getBrowserName(){


//   //from https://stackoverflow.com/questions/12489546/how-to-get-browsers-name-client-side
//   var nVer = navigator.appVersion;
//   var nAgt = navigator.userAgent;
//   var browserName  = navigator.appName;
//   var fullVersion  = ''+parseFloat(navigator.appVersion); 
//   var majorVersion = parseInt(navigator.appVersion,10);
//   var nameOffset,verOffset,ix;

//   // In Opera, the true version is after "Opera" or after "Version"
//   if ((verOffset=nAgt.indexOf("Opera"))!=-1) {
//      browserName = "Opera";
//      fullVersion = nAgt.substring(verOffset+6);
//      if ((verOffset=nAgt.indexOf("Version"))!=-1) 
//        fullVersion = nAgt.substring(verOffset+8);
//   }
//   // In MSIE, the true version is after "MSIE" in userAgent
//   else if ((verOffset=nAgt.indexOf("MSIE"))!=-1) {
//      browserName = "Microsoft Internet Explorer";
//      fullVersion = nAgt.substring(verOffset+5);
//   }
//   // In Chrome, the true version is after "Chrome" 
//   else if ((verOffset=nAgt.indexOf("Chrome"))!=-1) {
//      browserName = "Chrome";
//      fullVersion = nAgt.substring(verOffset+7);
//   }
//   // In Safari, the true version is after "Safari" or after "Version" 
//   else if ((verOffset=nAgt.indexOf("Safari"))!=-1) {
//      browserName = "Safari";
//      fullVersion = nAgt.substring(verOffset+7);
//      if ((verOffset=nAgt.indexOf("Version"))!=-1) 
//        fullVersion = nAgt.substring(verOffset+8);
//   }
//   // In Firefox, the true version is after "Firefox" 
//   else if ((verOffset=nAgt.indexOf("Firefox"))!=-1) {
//       browserName = "Firefox";
//       fullVersion = nAgt.substring(verOffset+8);
//   }
//   // In most other browsers, "name/version" is at the end of userAgent 
//   else if ( (nameOffset=nAgt.lastIndexOf(' ')+1) < (verOffset=nAgt.lastIndexOf('/')) ) {
//       browserName = nAgt.substring(nameOffset,verOffset);
//       fullVersion = nAgt.substring(verOffset+1);
//       if (browserName.toLowerCase()==browserName.toUpperCase()) {
//          browserName = navigator.appName;
//       }
//   }
//   // trim the fullVersion string at semicolon/space if present
//   if ((ix=fullVersion.indexOf(";"))!=-1)
//       fullVersion=fullVersion.substring(0,ix);
//   if ((ix=fullVersion.indexOf(" "))!=-1)
//       fullVersion=fullVersion.substring(0,ix);

//   majorVersion = parseInt(''+fullVersion,10);
//   if (isNaN(majorVersion)) {
//       fullVersion  = ''+parseFloat(navigator.appVersion); 
//       majorVersion = parseInt(navigator.appVersion,10);
//   }

//   // console.log(''
//   //                 +'Browser name  = '+browserName+'<br>'
//   //                 +'Full version  = '+fullVersion+'<br>'
//   //                 +'Major version = '+majorVersion+'<br>'
//   //                 +'navigator.appName = '+navigator.appName+'<br>'
//   //                 +'navigator.userAgent = '+navigator.userAgent+'<br>');

//   return browserName;
// }




function isRoot(node){
  
  if(!node.parentId || node.id == "0" || node.id.indexOf("root") >= 0)   {
   // console.log("root found");
    return true;  //chrome and firefox
  }
  
  return false;
}

function isOtherBookmarks(node){
 if(old2new[node.parentId] == rootId && (node.title == "Other Bookmarks" || node.title == "Other bookmarks")){ //firefox and chrome
      return true;
  }
  return false;

}

function isToolbar(node){
  if(old2new[node.parentId] == rootId && (node.title == "Bookmarks Toolbar" || node.title == "Bookmarks bar")){  //firefox and chrome
      return true;
  }

  return false;
}


function deleteAllBookmarks(result){
  console.log("Deleting all bookmarks.");

  deleteCount = 0;
 //delete/remove ALL bookmarks
  for(var i = 0 ; i < result[0].children.length; i ++){  //get children of root 
    var child = result[0].children[i];
    for(var j = 0 ; j < child.children.length; j++){  //get children of children of root 
      var childchild = child.children[j];
      if (pND) console.log("deleting  " + childchild.title);
      chrome.bookmarks.removeTree(childchild.id, deleteAllCallback);  //delete everything
      deleteCount++;
    }
  }

  if(deleteCount == 0){  //there were no bookmarks so the callback handler never fired

    bGen = generateBookmark(serverTree);  //create the global generator to process next bookmark from anywhere
    nextBookmark();//start the process of adding them

  }

}

function deleteAllCallback(){
  //global deleteCallbackCount;

  deleteCallbackCount++;
  if (pND) console.log("deleteCount: " + deleteCount + "  deleteCallbackCount: " + deleteCallbackCount);
  if(deleteCallbackCount == deleteCount){  //this means it's the last callback

    bGen = generateBookmark(serverTree);  //create the global generator to process next bookmark from anywhere
    nextBookmark();//start the process of adding them

  }
}


function storeRootIds(tree){  //used  for  adding things to those uneditable folders
  
  
  //console.log("rootId:" + rootId + "  toolbarId:" + bookmarksBarId + "  Other bookmark id:"  + otherBookmarksId);
  var count = countBookmarks(tree);
  if(isPopupVisible()) chrome.runtime.sendMessage({command: "localBefore", message: (count[0] + count[1])});


  tree = tree[0];
  rootId = tree.id;

    var i;
    for(i = 0; i < tree.children.length; i++){  //get all children in root
      var node = tree.children[i];
      if(!node || !node.id) continue;  //set to null in removeduplicates?
      if (isToolbar(node)){  //firefox and chrome
        bookmarksBarId = node.id;
      }else if (isOtherBookmarks(node)){ //firefox and chrome
        otherBookmarksId = node.id;
      }else if(isBookmarksMenu(node)){ //firefox
        bookmarksMenuId = node.id;
      }else if(isMobileBookmarks(node)){ //firefox
        mobileBookmarksId = node.id;
      }

    }





}

function isBookmarksMenu(node){
      if(node.title == "Bookmarks Menu"){ //firefox
        return true;
      }
      return false;
}

function isMobileBookmarks(node){
  if(node.title == "Mobile Bookmarks"){ //firefox
        return true;
  }
  return false;
}


function countBookmarks(tree){  //return number of folders and bookmarks in a 2 element array
  //console.log("Counting bookmarks");

  var counter = generateBookmark(tree);
  var bmark = counter.next()

  //console.log("Counting bookmarks in tree");
  //console.log(tree);
  //console.log(bmark);

  var node;
  var folderCount = 0;
  var bookmarkCount = 0;
  while(!bmark.done){
    node = bmark.value;
    if(node.url){
      bookmarkCount++;
    }else{  //no url = folder
      folderCount++;
    }
    bmark = counter.next();
  }

  var outArr = [folderCount,bookmarkCount];

  return outArr;
}




function node2bookmark(node,includeIndex = true){
//build bookmark object
  var bookmark = {};

  //create bookmark object suitable for create()

  if(pND) console.log("creating bookmark "+node.title+", parentId: " + node.parentId + " -> " + old2new[node.parentId]);
  
  var newid = old2new[node.parentId];
  if(!newid) {
    //console.log("using original parentId");
    newid = node.parentId;  //use original value  /shouldnt happen
  }
  
  bookmark["parentId"] = newid.toString();  //replace it with the existing folder id
  if(includeIndex) bookmark["index"] = node.index;
  bookmark["title"] = node.title;
  bookmark["url"] = node.url;

  return bookmark;
}



//generate the next bookmark when .next() is called
function* generateBookmark(nodes){
  if(!nodes){
    console.log("error.  Nodes is null");
    return;
  }
  
    var nlen = nodes.length;
    var i;

    //console.log(nodes);
    //console.log("Length:" + nlen);

    if(nlen == 0 && nodes.children && nodes.children.length > 0){  //happens sometimes, not sure why
      console.log("root node found in generatebookmarks");
      yield* generateBookmark(nodes.children);  //try again with the children nodes
    }


    for(i = 0; i < nlen; i++){
        var node = nodes[i];
        if(!node || !node.id) continue;  //it's my custom data I hacked on to the end of the json string - there's probably a better way to do that but /shrug


        //console.log(node);
        yield node;  //this bookmark
        
        //console.log(nodes[i].children);
        if(node.children && node.children.length > 0){  //if its got children
          //return the next child
          //console.log("yielding the children.");
          yield* generateBookmark(node.children);  //recursively traverse tree
        }
    }


}


//loop through all bookmarks
function nextBookmark(){  //calling this function is the signal that all callbacks have completed

  if(!bGen) return;  //we called createBookmark manually, in removeDuplicates
  var bmark = bGen.next();  //https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*
  
  //console.log(bmark);
  if(!bmark.done){  //are we done?
    //console.log("");

    oldTitlesMap[bmark.value.id] = bmark.value.title;  //cache titles by id


    if(isSkippable(bmark.value)){
       doSkippableStuff(bmark.value);
       nextBookmark(); //go to next
   
     }else{
      duplicateCheck(bmark.value);  //check if that node exists already.  callback is createBookmark
      
     }    
  }else{
    doCleanup();
    
  }
}

function isSkippable(node){
  if (pND) console.log("is skippable?:");
  if (pND) console.log(node);
  //our best attempt to figure out what we have to skip

 //if(isRoot(node) || isOtherBookmarks(node) || isToolbar(node)){  //skip the base bookmark folders
  if(isRoot(node) || old2new[node.parentId] == rootId || node.parentId == rootId){  //skip all root stuff
    return true;
  }
  return false;
}


//singular create
function createBookmark(node,includeIndex = true){    //happens after duplicate check

  //create our success function  
  var callback = function(result){

    //console.log("Results from create " + node.title +":");
    //console.log(result);

    creationCallback(node, result);
  }

  //is it a folder or a bookmark?
  var nodetype;
  if (node.url && node.url.length > 0){
      nodetype = "bookmark";
  }else{
    nodetype = "folder";
  }

  bookmark = node2bookmark(node, includeIndex);

  if(pND) console.log("\nAttempting to create " + nodetype + " : " + bookmark.title + "\n original parentId:" + node.parentId + "  new parentId:" + old2new[node.parentId]);
//  if (pND) console.log("bookmark:");
//  if (pND) console.log(bookmark);
//  if (pND) console.log("node:");
//  if (pND) console.log(node);


  chrome.bookmarks.create(bookmark, callback);  //the money line
  

}

function creationCallback(node, result){



  if (chrome.runtime.lastError){
    console.log(chrome.runtime.lastError.message);
    if(pND) console.log("orig parentId: " + node.parentId + "  new: " + old2new[node.parentId]);
    if(pND) console.log(node);
  }
  
  if (chrome.runtime.lastError && chrome.runtime.lastError.message == "Index out of bounds.") {
      console.log("Index out of bounds.  Trying again");  //dont know why this happens, just add it to next available spot
      createBookmark(node, false); //override the index

  } else if(chrome.runtime.lastError && chrome.runtime.lastError.message == "Can't modify the root bookmark folders.") {
    doSkippableStuff(node);
    nextBookmark();

  
  } else{


    var nodetype;
    if (node.url && node.url.length > 0){
        nodetype = "bookmark";
    }else{
      nodetype = "folder";
    }

    var newid;
    if(result){
      if (pND) console.log("Success.");
      newid = result.id;
      newTitlesMap[newid] = result.title;

      successes++;
      
      if(isPopupVisible()) chrome.runtime.sendMessage({command: "successes", message: successes });
      

    }else{


      if (pND) console.log(" fail.");
      //console.log(node);
      newid = node.id;
      failures++;


    }

    old2new[node.id] = newid;  //stores new ids

      nextBookmark();

  }
}


//functions used for listeners
function createCallback(id, object){
  //console.log("isListenerOn: " + isListenersOn);
  
  if(isListenersOn){
    console.log("Bookmark create detected for Id: "+id+"   saving all! ");  
    
    //chrome.bookmarks.getTree(storeAndOverwrite);  //overwrite server
    doBeforeStuff(storeAndOverwrite);

    //removeListeners();  //restore listeners after other events happened
    //when you delete all, like a thousand events fire that all do the same thing
  }

}
function removeCallback(id, object){

  if(isListenersOn){
    console.log("Bookmark removal detected for Id: "+id+"   saving all!");  
    doBeforeStuff(storeAndOverwrite);
    //chrome.bookmarks.getTree(storeAndOverwrite);  //overwrite server
    //removeListeners();  //restore listeners after other events happened
    //when you delete all, like a thousand events fire that all do the same thing
  }

}
function changeCallback(id, object){
//  console.log("isListenerOn: " + isListenersOn);
  
  if(isListenersOn){
    console.log("Bookmark change detected for Id: "+id+"   saving all!");
    doBeforeStuff(storeAndOverwrite);
    //chrome.bookmarks.getTree(storeAndOverwrite);  //overwrite server
    //removeListeners();  //restore listeners after other events happened
    //when you delete all, like a thousand events fire that all do the same thing
  }

}
function moveCallback(id, object){
//  console.log("isListenerOn: " + isListenersOn);
  
  if(isListenersOn){
    console.log("Bookmark move detected for Id: "+id+"   saving all!");
    console.log(object);
    doBeforeStuff(storeAndOverwrite);
    //chrome.bookmarks.getTree(storeAndOverwrite);  //overwrite server
    //removeListeners();  //restore listeners after other events happened
    //when you delete all, like a thousand events fire that all do the same thing
  }

}
function importCallback(){  //not working?
    //chrome.bookmarks.getTree(storeAndOverwrite);  //overwrite server
    doBeforeStuff(storeAndOverwrite);
}

function installCallback(details){
    if(details.reason == "install"){
        console.log("This is a first install!");
        doBeforeStuff(storeAndMerge);  //do I really want to store his bookmarks before he makes an account?
        //chrome.bookmarks.getTree(storeAndMerge);  //this has to happen at least once in the lifetime of the program, before loadAndMerge

    }else if(details.reason == "update"){
        var thisVersion = chrome.runtime.getManifest().version;
        console.log("This is an update");

        doBeforeStuff(loadAndOverwrite);
    }
}

function startupCallback(){
//  alert("Extension startup");
  console.log("Extension Startup.");
  // chrome.bookmarks.getTree(loadAndMerge); //loadAndMerge doesn't seem to work right away.
  doBeforeStuff(loadAndMerge);
}


function addListeners(){

  chrome.bookmarks.onCreated.addListener(createCallback);
  chrome.bookmarks.onRemoved.addListener(removeCallback);
  chrome.bookmarks.onChanged.addListener(changeCallback);
  chrome.bookmarks.onMoved.addListener(moveCallback);
  //chrome.bookmarks.onChildrenReordered.addListener(bookmarkChange);  //doesnt work
  //chrome.bookmarks.onImportEnded.addListener(importCallback);
  isListenersOn = true;

  console.log("adding listeners ");

}

function removeListeners(){  //remove during any import process, then restore them

  //console.log("removing listeners");

  isListenersOn = false;
  
  // chrome.bookmarks.onCreated.removeListener(createCallback);
  // chrome.bookmarks.onRemoved.removeListener(removeCallback);
  // chrome.bookmarks.onChanged.removeListener(changeCallback);
  // chrome.bookmarks.onMoved.removeListener(moveCallback);
  // //chrome.bookmarks.onChildrenReordered.removeListener(bookmarkChange);
  // //chrome.bookmarks.onImportEnded.removeListener(importCallback);

  console.log("removing listeners ");

}



function firefoxtree(result){
  console.log("firefox tree");
  console.log(result);
}



function doSkippableStuff(node){


  if (pND) console.log("Skipping node " + node.title);
  //console.log(node);

  if(isRoot(node)){

    old2new[node.id] = rootId;
   // console.log("Is Root");
  }else if(isOtherBookmarks(node)){
    old2new[node.id] = otherBookmarksId;
   // console.log("Is Other Bookmark");

  }else if(isToolbar(node)){
    old2new[node.id] = bookmarksBarId;
   // console.log("Is Toolbar");
  }else if(isBookmarksMenu(node)){
    if(bookmarksMenuId){  //does the bookmark menu exist (aka are we in firefox)
      old2new[node.id] = bookmarksMenuId;  //should be the same
    }else{
      //old2new[node.id] = otherBookmarksId;  //put it in 'other bookmarks'
    }
  }else if(isMobileBookmarks(node)){
    if(mobileBookmarksId){
      old2new[node.id] = mobileBookmarksId  //should be the same
    }else{
      //old2new[node.id] = otherBookmarksId;  //if we're not in firefox, put it in 'other bookmarks'
    }
  }

  newTitlesMap[node.id] = node.title;  //save new titles map for isSameParent
  if (pND) console.log(node.id + " becomes " + old2new[node.id]);

  skipped++;
  if(skipSpan = document.getElementById('skipped')){

    //$('#skipped').text(skipped);
    skipSpan.textContent = skipped
  }
  

}

function compare(tree1, tree2){  //this will compare everything in tree2 to tree 1

  //for each item in $tree 2
  //check if that same item exists in tree 1 by comparing title, parent title, and url
  var uniqueNodes = [];
  var moved = [];  //stores indexes that don't match (we cannot treat it like a new node, because you cannot put bookmarks with arbitrary indexes)
  var i, j;
  var t1 = tree1.length;
  var t2 = tree2.length;
  var dupNodes = [];

 // console.log("Comparing.  t1: " + t1 + " t2: " + t2);
  //console.log(tree1);
  //console.log(tree2);

  for (i = 0; i < t1; i++){  //get each node in tree 1
      node1 = tree1[i];
      if(!node1 || !node1.id) continue;  //that little 'load' tag I added on to the return output

      var isDuplicate = false;

      for(j = 0; j < t2; j++){  //look for a duplicate in tree 2
        node2 = tree2[j];
        if(!node2 || !node2.id) continue;  //that little 'load' tag I added on to the return output

      //see if there is a duplicate in tree 1
        if(isSame(node1, node2)){

          if(node1.index != node2.index && !isSkippable(node1)){

            moved.push([node1,node2]);  //their index does not match - save them and process it in loadAndOverwrite

          }


           var oldid = node1.id;
           old2new[oldid] = node2.id;  //store all ids - THIS ASSUMES NODE 1 is to be added!  That may not be the case and may cause issues.  Double check this.
     //      console.log( "Duplicate found: " + node1.title);

          if(node1.children && node1.children.length > 0){//its a folder - do its children right away
      //      console.log( "children found.  Processing " + node1.title + ". setting parentid to " + oldid);

            results = compare(node1.children, node2.children);
            uniqueNodes = uniqueNodes.concat(results[0]);
            moved = moved.concat(results[1]);
          }
   
          isDuplicate = true;
          
          break;  //keep looking for duplicates?
        }
      }
      
          
      if(!isDuplicate){  //if no duplicate
 //       console.log( "No duplicate found.  adding " + node1.title);
        uniqueNodes.push(node1);  //store all the unique to tree 1 nodes

      }

  }

  if(dupNodes.length > 0){
    console.log("dupNodes");
    console.log(dupNodes);
  }

  return [uniqueNodes,moved];  //return multiple values
}

function isSame(node1, node2){  //straight up match or toolbar
  //console.log("is Same?:");
  //console.log(node1.url);
  //console.log(node2.url);
  
  if(!node1.title && !node1.url && !node2.title && !node2.url) return true;  //null values cannot compare to each other

  //exceptions - chrome vs firefox calls its folders different names
  if ((node1.title.toLowerCase() == "bookmarks toolbar" && node2.title.toLowerCase() == "bookmarks bar") 
  || (node2.title.toLowerCase() == "bookmarks toolbar" && node1.title.toLowerCase() == "bookmarks bar") ){
    return true;
  }


  if ((node1.title.toLowerCase() == node2.title.toLowerCase() && node1.url == node2.url)){
    //everything matched so far
        return true;
  }

  return false;
  
}

function getServerAfter(){
  outstring = "&command=getServerAfter";
  sendtophp(outstring);
}

function getServerAfterCont(tree){
  var count = countBookmarks(tree);
  console.log("After Server totals:" + (count[0] + count[1]));
  if(isPopupVisible())  chrome.runtime.sendMessage({command: "serverAfter", message: (count[0] + count[1])});
}

function getUniques(){  //compare server woth local, and local with server, and save the unique nodes for each.  Also count duplicates and save value

      
      result1 = compare(localTree, serverTree);
      localUnique = result1[0];  //save into globals
      movedNodes = result1[1];
      var count = countBookmarks(localUnique);
      var uniqueLocalCount = (count[0] + count[1]);
      console.log(uniqueLocalCount + " Unique to local bookmarks:");
      //if(pND) console.log(result1);
      //console.log(result1);

      result2 = compare(serverTree, localTree);  //don't add everything, only the ones that are missing
      serverUnique = result2[0];  //save into globals
      //movedNodes = result2[1];
      count = countBookmarks( serverUnique);
      var uniqueServerCount = (count[0] + count[1]);
      console.log(uniqueServerCount + " Unique to server bookmarks:");
      if(pND) console.log(serverUnique);

      dup1 = localTreeCount - uniqueLocalCount;
      dup2 = serverTreeCount - uniqueServerCount;

      //dup1 should always equal dup2
      if(dup1 != dup2){
        console.log("duplicates between trees do not match!  " + dup1 + "  " + dup2);
        console.log("localTreeCount: " + localTreeCount + " uniqueLocalCount: " + uniqueLocalCount + " serverTreeCount: " + serverTreeCount + " uniqueServerCount : " + uniqueServerCount);
      }

      duplicates = dup1;
      
      
      
  }


function doBeforeStuff(callback){  //grab server and local bookmarks and compare them


  chrome.storage.sync.set({operationInProgress:"true"});
  resetGlobals();
  removeListeners();
  console.log("Do Before Stuff.  Getting local tree");
  chrome.bookmarks.getTree(getLocalTree);
  doBeforeStuffCallback = callback;  //set the function to call after beforeStuff finishes.  (sigh another global to get around async calls)
}

function getLocalTree(tree){
  localTree = tree;  //set the global

  console.log("Get localTree completed");
  var count = countBookmarks(tree);
  localTreeCount = (count[0] + count[1]);
  //console.log("Before Local totals:" + localTreeCount);
  if(isPopupVisible()) chrome.runtime.sendMessage({command: "localBefore", message: localTreeCount});
  storeRootIds(localTree);
  getServerBefore();
}

function getServerBefore(){
  outstring = "&command=getServerBefore";
  sendtophp(outstring);
}

function getServerBeforeCont(tree){
  
  serverTree = tree;  //set the global
  //  console.log("serverTree set");
  // console.log(tree);
  var count = countBookmarks(tree);
  serverTreeCount = (count[0] + count[1]);
  console.log("Before Server totals:" + serverTreeCount);
  if(isPopupVisible()) chrome.runtime.sendMessage({command: "serverBefore", message: serverTreeCount});

  getUniques();  //set global unique 
  
  doBeforeStuffCallback();  //is different depending on input command

  //record that the operation completed successfully
  chrome.storage.sync.set({operationInProgress:"false"});
}


function removeDuplicates(tree, parentId = rootId){ 

  var tlen = tree.length;
  if(tlen == 0 && tree.children){  //root node
    removeDuplicates(tree.children, rootId);
  }

  var i, j;
  var branch = [];

  for (i = 0; i < tlen; i++){
    var node1 = tree[i];


    if(!node1 || !node1.id) continue;  //if it was deleted or is root

    if(!node1.url && !node1.title && rootId && node1.parentId == rootId){
      console.log("bad data found.  Deleting Async.  Counts may be off.");
      console.log(node1);
      deleteNode(node1);
      continue;
    }


    if( node1.parentId != parentId){  //its one of those outside merged children from a duplicate folder
      //console.log("attempting to create bookmark. node1.parentId:" + node1.parentId  + " parentId:" + parentId);
      node1.parentId = parentId;  //merge children parentid to single id
      //add it to client folder 
      
      createBookmark(node1,false);

    }

    for(j = i+1; j < tlen; j++){  //lookahead for duplicates
      var node2 = tree[j];
      if(!node2 || !node2.id) continue;  //if it was deleted

      //console.log("comparing "+node1.title+" with " + node2.title);
      if(isSame(node1, node2)){ 
        //console.log("dup found.");
        //if dup is found
        //we want to copy all children of dup to original
        //and delete the dup
        if(node2.children && node2.children.length > 0){
            //console.log("merging children .");
            node1.children = node1.children.concat(node2.children, node1.id);
        }
        //duplicates++;  //why did I comment this out?
        console.log("Duplicates found on client.  Deleting asynchronously (counts may be off)");
        console.log(node2);
        
        deleteNode(tree[j]);  //delete from client // Remember to add the non-dup children to client in new folder
        tree[j] = null;  //delete it from data structure


      }
    }

    // this should happen after we merged the children
    if(node1.children && node1.children.length > 0){
      //console.log("processing children of " + node1.title);
      removeDuplicates(node1.children, node1.id); 
    }


  }

  return tree;
}

function doCleanup(){

  if (movedQueue != 0){
    console.log("Cannot restore listeners yet.  There are bookmarks yet to be moved");
    return;  //doCleanup() will be called from the moveComplete callback
 }


  console.log("All bookmarks processed.");

  // console.log("old2new:");
  // console.log(old2new);
  // console.log("oldTitlesMap:");
  // console.log(oldTitlesMap);
  // console.log("newTitlesMap:");
  // console.log(newTitlesMap);
  var count;
  var localATotal = 0;
  
  count = countBookmarks(localTree);
  var localBTotal = (count[0] + count[1]);
  console.log("Local Before Total:" + localBTotal);
  //console.log("Folders:" + count[0]);
  //console.log("Bookmarks:" + count[1]);
  

  if(serverTree){  //was it a load
    count = countBookmarks(serverTree);
    var serverBTotal = (count[0] + count[1]);
    console.log("Server Before Total:" + serverBTotal);

  }
  console.log("Successes: " + successes);

  var localAfterCallback = function(result){
    //result = removeDuplicates(result);
    var counts = countBookmarks(result);
    localATotal = counts[0] + counts[1];
    console.log("Local After totals: " + localATotal);
    if(isPopupVisible()) chrome.runtime.sendMessage({command: "localAfter", message: localATotal});

  }
  chrome.bookmarks.getTree(localAfterCallback);


  console.log("Failures: " + failures);
  console.log("Duplicates: " + duplicates);
  console.log("Skipped: " + skipped);
  console.log("Deleting: " + deleting);
  console.log("Deleted: " + deleteCallbackCount);


  
  if(isPopupVisible()) {
    chrome.runtime.sendMessage({command: "successes", message: successes});
    chrome.runtime.sendMessage({command: "failures", message: failures});
    chrome.runtime.sendMessage({command: "skipped", message: skipped});
    chrome.runtime.sendMessage({command: "duplicates", message: duplicates});
    chrome.runtime.sendMessage({command: "deleted", message: deleting});
    chrome.runtime.sendMessage({command: "moved", message: moved});
  }
  getServerAfter();

  addListeners();  //restore listeners
  //quit(0);  //throws an error, I can't find a way to end event process


  blinkIcon(false);

}

function syncIndexes(){

}

function resetGlobals(){


  duplicates = 0;
  failures = 0;
  successes = 0;
  skipped = 0;
  createCount = 0;
  createCallbackCount = 0;
  deleteCount = 0;
  deleteCallbackCount = 0;
  deleting = 0;
  localTree = null;
  serverTree = null;
  localUnique = null;
  serverUnique = null;
  localTreeCount = 0;
  serverTreeCount = 0;
  movedQueue = 0;
  moved = 0;

  if(isPopupVisible()){

    chrome.runtime.sendMessage({command: "successes", message: " "});
    chrome.runtime.sendMessage({command: "failures", message: " "});
    chrome.runtime.sendMessage({command: "skipped", message: " "});
    chrome.runtime.sendMessage({command: "duplicates", message: " "});
    chrome.runtime.sendMessage({command: "deleted", message: " "});
    chrome.runtime.sendMessage({command: "localBefore", message: " "});
    chrome.runtime.sendMessage({command: "localAfter", message: " "});
    chrome.runtime.sendMessage({command: "serverBefore", message: " "});
    chrome.runtime.sendMessage({command: "serverAfter", message: " "});
    chrome.runtime.sendMessage({command: "moved", message: " "});
  }
}

function storeAndOverwrite(){
console.log("Store and overwrite.  overwrite bookmarks on server with bookmarks on computer");
  
  //convert to big string7
  var outstring = JSON.stringify(localTree);

  outstring = encodeURIComponent(outstring);  //required, decoded automatically in PHP $_POST
  outstring = "&command=storeAndOverwrite &json="+ outstring;
//compress client size?  //https://www.google.co\m/search?q=bzip2+for+javascript&ie=utf-8&oe=utf-8&client=firefox-b-1-ab

  sendtophp(outstring);

}

function storeAndOverwriteCont(result){
    console.log(result);  //how many bytes written
    doCleanup();
}

function storeAndMerge(){
  console.log("Store and merge.  merge bookmarks on computer with bookmarks on server");
  
  //convert to big string
  var outstring = JSON.stringify(localTree);
  outstring = encodeURIComponent(outstring);  //required, decoded automatically in PHP $_POST
  outstring = "&command=storeAndMerge &json="+ outstring;
  
  sendtophp(outstring);

}

function storeAndMergeCont(result){
    //merge was successful, now we can merge everything from server with current bookmarks
    console.log(result[0]);  //how many bytes written
    doCleanup();
}

function loadAndMerge(){
  
  console.log("load merge command.  Downloading bookmarks from server");
  bGen = generateBookmark(serverUnique);  //create the global generator to process next bookmark from anywhere
  nextBookmark();//start the process of adding them

}


function loadAndOverwrite(){
  //this is the only place bookmarks are ever deleted.  To make super duper sure nothing goes wrong, we are going to download both server and local bookmarks, and compare them all.
  // if there are a large amount of changes we won't do it.
  // we also make sure the final totals match

  console.log("LOAD and overwrite.  Downloading bookmarks from server and deleting all local ones");
 

  if(localUnique.length == 0 && serverUnique.length == 0 && movedNodes.length == 0){
    console.log("No change.  Nothing to do.");
    doCleanup();
    return;
  }

  moveMoved();  //moved nodes cannot be treated as new nodes to be created, since you cannot create at an arbitrary index.  So it needs its own processing


  //check if many bookmarks are being deleted
  var deleteAlert = 10;
  var count = countBookmarks(localUnique);
  if((count[0] + count[1]) > deleteAlert){
    console.log((count[0] + count[1]) + " bookmarks are being removed.  Are you sure you want to do this?");
    //CATCH OUTPUT OF ALERT BOX
    //allow them to see the bookmarks we're deleting
  }

  //delete only what is unique to local
  console.log("deleting localUnique");
  var count = countBookmarks(localUnique);
  deleting = (count[0] + count[1]);
  console.log("Count bookmarks: " + deleting);
  console.log(localUnique);
  deleteNodes(localUnique);


  //add only what is needed
  bGen = generateBookmark(serverUnique);
  nextBookmark();
  

}

function movedCallback(node){
  console.log("Move callback.");
  console.log(node);
            //console.log(result);
  movedQueue--;  //keep track of how many nodes we have yet to move
  moved++;  //for info output
  if(movedQueue == 0){
    //for whatever reason, moving bookmarks seems to be the last thing to happen, so keep track of how many are left to move, and when they are all done, call doCleanup()
    console.log("Moves are complete - calling doCLeanup()");
    doCleanup();
  }
}


function moveMoved(){
  //also sync the INDEX (or order) of the bookmarks
  var mlen = movedNodes.length;  //global, created in compare() and getuniques()
  if(mlen > 0){
    console.log(mlen + " nodes to move!!");
    console.log(movedNodes);
    //update the node's indexes

    for(i = 0;i < mlen; i++){
      var node1 = movedNodes[i][0];
      var node2 = movedNodes[i][1];
   

      destination = {};
      //destination.parentId = node2.parentId;
      destination.index = node2.index;
      console.log('moving id: ' + node1.id + " to index " + node2.index);
      chrome.bookmarks.move(node1.id, destination, movedCallback);
      movedQueue++;
    }

  }
}


function deleteNodes(nodes){

  var nlen = nodes.length;
  var i = 0;
  for( i = 0; i < nlen; i++){
    node = nodes[i];

    if(isSkippable(node)){  //we cannot delete it
      console.log("is skippable, cannot delete.");
      console.log("nlen: " + nlen + " i:" + i + " skipped: " + skipped);
      skipped++;
      deleteNodes(node.children);
    }else{

      deleteCount++;
      if(node.children){  //its a folder
     //  console.log("deleting folder node.");
        var promise = chrome.bookmarks.removeTree(node.id, onRemoved);  //https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/bookmarks/removeTree
    //    promise.then(onRemoved, onRejected);
      }else{
      //  console.log("deleting single node.");
        var promise = chrome.bookmarks.remove(node.id, onRemoved);
     //   promise.then(onRemoved, onRejected);  //promise is undefined??
      }
    }
  }

}


function deleteNode(node){  //delete single node, no callbacks
  deleting++;
  //deleteCount++;
  if(node.children){  //its a folder
    console.log("deleting folder node.");
    var promise = chrome.bookmarks.removeTree(node.id, onSingleRemoved);  //https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/bookmarks/removeTree
    //promise.then(onRemoved, onRejected);
  }else{
    console.log("deleting single node.");
    var promise = chrome.bookmarks.remove(node.id, onSingleRemoved);
    //promise.then(onRemoved, onRejected);  //promise is undefined??
  }

}

function onRemoved() {

 deleteCallbackCount++;

 if (chrome.runtime.lastError){  //trap errors
   console.log(chrome.runtime.lastError.message);
   skipped++;
 }else{

    console.log("Removed");
    
  }
  
  if(deleteCallbackCount == deleteCount){  //everything has been deleted.

    //add only what is needed
    bGen = generateBookmark(serverUnique);
    nextBookmark();
  }

}

function onSingleRemoved() {
  if (chrome.runtime.lastError){  //trap errors
     console.log(chrome.runtime.lastError.message);
     skipped++;
   }else{

    console.log("Removed single");
    deleteCallbackCount++;
  }
}

function isPopupVisible(){
  var views = chrome.extension.getViews({ type: "popup" });  //https://stackoverflow.com/questions/8920953/how-determine-if-the-popup-page-is-open-or-not
  if(views.length > 0){
    console.log("Popup is visible");
    return true;
  }
  return false;

}