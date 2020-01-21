var _clientID; //store in server which client created the bookmark, so we know what parentId to use
var _email; //store login info
var _password;
var _bGen; //the global bookmark generator
var _rootId = null; //store root folder ids
var _bookmarksBarId;
var _otherBookmarksId;
var _bookmarksMenuId;
var _mobileBookmarksId;
var _server2localMap = new Map(); //stores server id and the corresponding local Id we created
var _opCounter = 0; //looping through operationqueue
var _operations = []; //array to hold operations we need to perform on local bookmark tree
var _isListenersOn = false; // when we add server stuff, we don't want to trigger the listeners!
var _operationQueue = []; //array to hold operations we need to perform on server 
var _optInAccepted = false;
var _firstLoginOccured = false;
var _lastUpdate; //timestamp to keep track of which ops to pull from server
var _iconOn = false; //blink the icon
var _localTree; //store the entire tree
var _localTreeAssoc //store the entire tree as an associative array for fast lookup
var _importing = false; //detect if we are importing, reduce load on server by queueing everything once
//ccurently not in use
function getBrowserInfo() { //https://stackoverflow.com/questions/41819284/how-to-determine-in-which-browser-your-extension-background-script-is-executing  
    // Firefox 1.0+ (tested on Firefox 45 - 53)
    var isFirefox = typeof InstallTrigger !== 'undefined';
    // Opera 8.0+ (tested on Opera 42.0)
    var isOpera = (!!window.opr && !!opr.addons) || !!window.opera ||
        navigator.userAgent.indexOf(' OPR/') >= 0;
    // Internet Explorer 6-11
    //   Untested on IE (of course). Here because it shows some logic for isEdge.
    var isIE = /*@cc_on!@*/ false || !!document.documentMode;
    // Edge 20+ (tested on Edge 38.14393.0.0)
    var isEdge = !isIE && !!window.StyleMedia;
    //console.log(info.name);
    if (isFirefox) {
        _browserInfo = "Firefox";
    } else if (isEdge) {
        _browserInfo = "Edge";
    } else if (isOpera) {
        _browserInfo = "Opera";
    } else {
        _browserInfo = "Chrome?";
    }
}
//generate the next bookmark when .next() is called
function* bookmarkGenerator(nodes) {
    if (!nodes) {
        console.log("error.  Nodes is null");
        return;
    }
    var nlen = nodes.length;
    var i;
    // console.log(typeof(nodes));  //always an object
    // console.log(nodes);
    // console.log("Length:" + nlen);
    if (nlen == undefined && nodes.children && nodes.children.length > 0) { //happens sometimes, not sure why
        //console.log("root node found in bookmarkGenerator");
        yield* bookmarkGenerator(nodes.children); //try again with the children nodes
    }
    for (i = 0; i < nlen; i++) {
        var node = nodes[i];
        if (!node || !node.id) continue; //it's my custom data I hacked on to the end of the json string - there's probably a better way to do that but /shrug
        //console.log(node);
        yield node; //this bookmark
        //console.log(nodes[i].children);
        if (node.children && node.children.length > 0) { //if its got children
            //return the next child
            //console.log("yielding the children.");
            yield* bookmarkGenerator(node.children); //recursively traverse tree
        }
    }
}

function storeTree(callback = false) { //just get all the bookmarks and store it in _localTree
    chrome.bookmarks.getTree(function(tree) {
        _localTree = tree;
        _localTreeAssoc = tree2assoc(tree);
        storeTreeIds(tree);
        if (callback) { //if we supplied a callback, call that.
            callback(tree);
        }
    });
}

function printtree() {
    chrome.bookmarks.getTree(printTreeCallback);
}

function printTreeCallback(localTree) {
    // console.log(localTree)
    var bookmark;
    _bGen = bookmarkGenerator(localTree); //create the global generator to process next bookmark from anywhere
    for (bookmark of _bGen) { //loop through all bookmarks created through generator  //https://stackoverflow.com/questions/25900371/how-to-iterate-over-the-results-of-a-generator-function
        console.log(bookmark)
    }
}
//########################################################## START LISTENERS ####################################################################################
function listenersOn() {
    chrome.bookmarks.onCreated.addListener(createListener);
    chrome.bookmarks.onRemoved.addListener(removeListener);
    chrome.bookmarks.onChanged.addListener(changeListener);
    chrome.bookmarks.onMoved.addListener(moveListener);
    try {
        //chrome.bookmarks.onImportBegan.addListener(importListener);  //why is this erroring on me on firefox??
        chrome.bookmarks.onImportBegan.addListener(function() {
            _importing = true;
            console.log("Import Began.");
        });
        chrome.bookmarks.onImportEnded.addListener(function() {
            _importing = false;
            console.log("Import Ended.");
            processQueue(); //NOW send everything
        });
    } catch (e) {
        console.log("Error.  Unable to create import listeners.  Importing large amounts may crash server!");
        _importing = false;
        console.log(e);
    }
    _isListenersOn = true;
    console.log("adding listeners ");
}

function listenersOff() { //remove during any import process, then restore them
    _isListenersOn = false; //disableing them is asyncronous and leads to bad stuff so I just use a boolean
    console.log("removing listeners ");
}
//functions used for listeners
function createListener(id, object) { //they added a bookmark
    //console.log("isListenerOn: " + isListenersOn);
    if (_isListenersOn) {
        console.log("Bookmark create detected for Id: " + id);
        // console.log(object);
        queueOperation("add", object);
    } else {
        console.log("createListener fired but Listener is off");
    }
}

function removeListener(id, object) { //they deleted a bookmark
    if (_isListenersOn) {
        console.log("Bookmark removal detected for Id: " + id);
        // console.log(object);
        if (object.node) { //for some reason the object in delete is split into 3 separate parts
            newObj = object.node;
            newObj.parentId = object.parentId;
            newObj.index = object.index;
            object = newObj;
        }
        object.id = id;
        queueOperation("delete", object);
    } else {
        console.log("removeListener fired but Listener is off");
    }
}

function changeListener(id, object) { //rename a bookmark
    //  console.log("isListenerOn: " + isListenersOn);
    if (_isListenersOn) {
        console.log("Bookmark change detected for Id: " + id);
        // console.log(object);
        object.id = id; //chrome doesn't always add these
        queueOperation("rename", object);
    } else {
        console.log("changeListener fired but Listener is off");
    }
}

function moveListener(id, object) {
    //  console.log("isListenerOn: " + isListenersOn);
    if (_isListenersOn) {
        console.log("Bookmark move detected for Id: " + id);
        // console.log(object);
        object.id = id;
        queueOperation("move", object);
    } else {
        console.log("moveListener fired but Listener is off");
    }
}

function importListener(data) {
    //  console.log("isListenerOn: " + isListenersOn);
    if (_isListenersOn) {
        console.log("Bookmark import detected ");
        // object.id = id;
        // queueOperation("move", object);
    } else {
        console.log("importListener fired but Listener is off");
    }
}

function getTitle(id) {
    node = _localTreeAssoc[id]; // in what situation would this be NOT up to date?
    return node.title;
}

function getUrl(id) {
    node = _localTreeAssoc[id]; // in what situation would this be NOT up to date?
    if (!node) {
        console.log("null node for url id:" + id);
        console.log(_localTreeAssoc);
        return null;
    }
    if ('url' in node) { //https://stackoverflow.com/questions/11040472/how-to-check-if-object-property-exists-with-a-variable-holding-the-property-name
        return node.url;
    }
    return null;
}

function queueOperation(op, node) { //in case they are offline, gotta store each change and process it as needed
    node.operation = op; //just store the operation in the node
    node = prepareForDB(node); //make sure all values are filled in.  Not required, but makes debugging easier
    console.log(node);
    if (!_operationQueue) {
        //no idea how sometimes it doesn't exist
        _operationQueue = [];
    }
    _operationQueue.push(node); //potential issue here - we can add many things before we get a response back from the server...  //create a queueTimestamp to make sure we don't do ops twice
    // we could also add something and get a response back and the server will deliete what we just added, before we send it to the server!
    chrome.storage.local.set({ operationQueue: _operationQueue }); //store it long term
    if (!_importing) { //IMPORTING tends to create a lot of events all at once.  Rather than send thousand of separate events at the server and risk it locking us out, use our Queue, queue everything, then at the end of importing, process the queue
        processQueue(); //if it fails, the operation stays in the queue
    }
}

function prepareForDB(node) { //make sure all values are filled in.  Not required, but makes debugging easier
    node.queueTimestamp = Date.now(); //so we don't keep inserting the same OP into the database, in the case of lag or something
    node.parentClient = _clientID; //also set in server, but only after we add it to DB.  Save a server lookup by doing it here
    if (!node.title) { //strangely, firefox doesn't include title, making debugging difficult
        node.title = getTitle(node.id);
    }
    if (!node.url) { //strangely, firefox doesn't include title, making debugging difficult
        node.url = getUrl(node.id);
    }
    node.parentFolders = getParentFolders(node);
    //update local data structures cuz something changed (do at end) 
    _localTreeAssoc[node.id] = node;
    return node;
}

function processQueue() {
    //just send it all to the server in one go.  If success, delete it all at one go.  
    if (_operationQueue.length > 0) {
        console.log(_operationQueue);
        sendToPhp("processQueue", _operationQueue);
    }
}

function processQueueSuccess() { //queue got sent to server successfully
    console.log("removeing Queue");
    if (_operationQueue.length > 0) {
        _operationQueue = [];
    }
    chrome.storage.local.remove(["operationQueue"]);
    storeTree(); //the tree probably changed.. just update local vars, Just in case.  Can't hurt.
}
//########################################################## END LISTENERS ####################################################################################
//########################################################## START ACCOUNT STUFF ##############################################################################
function optin() { //they clicked accept on optin page
    chrome.storage.local.set({ "optIn": true, "optInShown": true });
    //see https://stackoverflow.com/questions/59671336/chrome-addon-how-to-make-a-button-in-change-page-to-a-new-url
    chrome.browserAction.setPopup({ popup: "register.html" }); //register screen is now default popup
    startup(); //load variables and stuff
}

function checkOptIn() { //the first thing done
    // show the tab if we haven't registered the user reacting to the prompt.
    chrome.storage.local.get("optInShown", function(result) {
        if (!result.optInShown) {
            //   chrome.tabs.create({ url: "optIn/opt-in.html" });
            chrome.browserAction.setPopup({ popup: "optIn/opt-in.html" });
            return false;
        } else {
            chrome.browserAction.setPopup({ popup: "register.html" });
            startup();
        }
    });
    //return true;
}

function startup() {
    // chrome.runtime.onStartup.addListener(startupCallback);  //dont trust it
    listenersOn(); //respond to click events
    loadAndLogin(); //retreive stored data
}

function createAccount(e, p) {
    _email = e; //set globals
    _password = p;
    console.log(chrome.runtime.lastError);
    console.log("Creating an account");
    sendToPhp("createAccount");
}

function createAccountCont(response) {
    console.log("Creating an account continued");
    if (response == "validatingEmail") {
        sendStatus("An email has been sent to " + _email + ".  (May take several minutes to arrive.)  Please follow the instructions in the email to validate your account.", true);
        chrome.browserAction.setTitle({ title: "Awaiting EmailValidation" });
        chrome.storage.local.set({ firstLoginOccured: "false" });
    } else if (response == "AccountExists") {
        console.log("AccountExists already");
        sendStatus("An account with this email already exists.  Please <a href='login.html'>login</a>.");
    } else {
        sendStatus(response);
        chrome.browserAction.setTitle({ title: response });
    }
}

function resetPassword(request) {
    //then send a message to email
    //that direct them to a php page to put in a new password
    console.log("resetPassword()");
    console.log(request);
    _email = request.email;
    _password = request.newPassword;
    sendToPhp("resetPassword");
    logout(); //delete all local data
    // chrome.storage.local.set({password:""});  ///weellll no.. it shouldnt be official until they click the link?
}

function showRegisterScreen() { //link clicked clicked
    // similar behavior as clicking on a link
    chrome.windows.create({ url: "register.html", type: "popup", height: 400, width: 400 });
}

function showLoginScreen() { //link clicked clicked
    chrome.browserAction.setPopup({ popup: "login.html" });
}

function showResetPasswordScreen() { //link clicked clicked
    chrome.windows.create({ url: "resetPassword.html", type: "popup", height: 400, width: 400 });
}

function login() { //checks that the server is online and valid account
    sendToPhp("login");
}

function loginCont(response) {
    console.log(response);
    if (chrome.runtime.lastError) { //trap errors
        console.log(chrome.runtime.lastError.message);
    }
    if (response == "success") {
        console.log("Setting icon to on");
        var manifest = chrome.runtime.getManifest(); //get version
        var version = chrome.runtime.getManifest().version; //https://stackoverflow.com/questions/14149209/read-the-version-from-manifest-json
        //chrome.browserAction.setTitle({title:"Daxmarks "+version+" - Connected."});
        chrome.browserAction.setTitle({ title: "Daxmarks - Connected to account " + _email });
        chrome.browserAction.setIcon({ path: 'icons/icon_96_on.png' }); //change icon to something lit up
        chrome.browserAction.setPopup({ popup: "main.html" }); //show main form
        console.log("Saving: " + _email + ", " + _password);
        chrome.storage.local.set({ email: _email });
        chrome.storage.local.set({ password: _password });
        storeTree(); //store the local tree data.  This is done here (not load) as a workaround for if they use the 'rebuild bookmarks' feature. 
        //must be done before install, or update, for specialFolder checking
        if (!_firstLoginOccured) {
            console.log("firstLoginOccured: " + _firstLoginOccured);
            sendStatus("First time login detected - storing your bookmarks.");
            installStart(); //at the very end of a successful login check if there were any new updates (will probably get all the stuff we just added with the install.  oh well.
        } else {
            sendStatus("Login success!  Your bookmarks are now syncing.", true);
            updateStart();
        }
    } else if (response == "invalid") {
        if (isPopupVisible()) {
            chrome.runtime.sendMessage({ command: "status", message: "Incorrect email or password." }); //errors if status is not visible
        }
    } else if (response == "noaccount") {
        if (_email != '') { //they did a reset/logout in the middle of some operation.  Don't show a message if their email variable just got reset
            sendStatus("No account exists for " + _email);
        }
    } else if (response == "awaitingemail") {
        sendStatus("Awaiting email validation.  Re-sending the email.");
        resendvalidation();
        //document.getElementById('resendemail').onclick = resendvalidation();  //set a click handler for the just created hyperlink element.   //https://stackoverflow.com/questions/1265887/call-javascript-function-on-hyperlink-click  //nope.. message is sent async
    } else {
        sendStatus(response);
        chrome.browserAction.setTitle({ title: response }); //in case no popup visible
    }
}

function resendvalidation() {
    sendToPhp("resendvalidation")
}

function logout() {
    console.log("logout.  Setting icon to disabled");
    chrome.browserAction.setPopup({ popup: "login.html" });
    chrome.browserAction.setIcon({ path: 'icons/icon_96_off.png' }); //change icon
    //don't delete storage, in case they want to log back in don't make them retype their whole password
    chrome.browserAction.setTitle({ title: "Daxmarks 2 - Click to log in." });
    chrome.storage.local.set({ password: "" });
    _email = "";
    _password = "";
    sendStatus("Logging out.", true);
    //window.close();  //causes 'fail to fetch errors, locks up addon'
}

function installStart() { //send all bookmarks to server
    //create a clientID
    chrome.bookmarks.getTree(install);
}

function install(tree) { //add all bookmarks to server
    sendToPhp("install", tree);
}

function installSuccess() { //we successfully sent everything to server
    console.log("installSuccess()");
    chrome.storage.local.set({ firstLoginOccured: true }); //only if it was success do we create firstTime flag
    _firstLoginOccured = true;
    forceUpdate(); //get stuff from server  //it probably failed before because we didn't have the correct ids.  We do now, so just update everything again.  yes it means processing all the ops we just added, so be it.
}

function loadAndLogin() { //grab everything from storage
    console.log("load and login");
    //last time we updated
    chrome.storage.local.get(['lastUpdate'], function(lastUpdate) {
        if (!lastUpdate || lastUpdate.lastUpdate == "") {
            updateTime(0); //get everything
            return;
        }
        _lastUpdate = lastUpdate.lastUpdate;
    });
    chrome.storage.local.get(['operationQueue'], function(operationQueue) { //here is where we store changes made but weren't able to send them to server
        if (!operationQueue || !operationQueue.operationQueue || operationQueue.operationQueue == "") return;
        _operationQueue = operationQueue.operationQueue;
        console.log("_OperationQueue found");
        console.log(_operationQueue);
    });
    chrome.storage.local.get(['firstLoginOccured'], function(firstLoginOccured) {
        if (!firstLoginOccured || firstLoginOccured.firstLoginOccured == "") return;
        _firstLoginOccured = firstLoginOccured.firstLoginOccured;
    });
    chrome.storage.local.get(['optInAccepted'], function(optInAccepted) {
        if (!optInAccepted || optInAccepted.optInAccepted == "") return;
        _optInAccepted = optInAccepted.optInAccepted;
    });
    //get clientId - unique to this browser for this user
    chrome.storage.local.get(['clientID'], function(data) {
        console.log("results back from get clientID");
        console.log(data);
        if (!data || !data.clientID || data.clientID == "" || data.clientID == undefined || data.clientID == null) { //go ahead and create a unique client id.  this should never happen again.  We do NOT want this to change.
            _clientID = Date.now();
            chrome.storage.local.set({ clientID: _clientID });
        } else {
            _clientID = data.clientID;
        }
    })
    chrome.storage.local.get(['email'], function(email) { //sometimes this returns an object, sometimes a string?
        if (!email || email.email == "") {
            console.log("_email not found in storage");
            return; //first time, don't even bother to verify
        }
        //email found... we don't need to register
        chrome.browserAction.setPopup({ popup: "login.html" });
        chrome.storage.local.get(['password'], function(password) {
            if (!password || password.password == "") {
                console.log("password not found in storage");
                return;
            }
            _email = email.email;
            _password = password.password; //send them to server every interaction
            console.log("email, password: " + _email + " " + _password);
            login(); //login here because we can't login until we know variables are loaded
        });
    });
}

function toggleIcon() { //just some fun visual flair - rarely used
    //console.log("Toggling Icon!");
    _iconOn = !_iconOn;
    if (_iconOn) {
        chrome.browserAction.setIcon({ path: 'icons/icon_96_green.png' }); //change icon
    } else {
        chrome.browserAction.setIcon({ path: 'icons/icon_96_on.png' }); //change icon
    }
    //_timer1 = setTimeout(blinkIcon,300);   //this makes it keep blinking indefinitely until explicitly killed 
}

function forceValidate() { //testing only
    sendToPhp("forceValidate");
}
//######################################################################################################################################################################
//############################################################## START BOOKMARKS FUNCTIONS #############################################################################
//######################################################################################################################################################################
function forceUpdate() { //force update EVERYTHING
    _lastUpdate = 0;
    updateStart();
}

function updateStart() { //get all operations after a certain timestamp and apply them to local client
    sendStatus("Checking server for any changes. <br>");
    // blinkIcon();
    sendToPhp("update", _lastUpdate);
}

function updateCont(data) { //check the server for any changes.  results should be retunred as operations to perform to bring up to date
    console.log("Update continued");
    if (data == "installNeeded") { //OPs table was not found!
        console.log("Install needed...installing");
        installStart(); //they somehow installed the client but are now making a new account.. I should have a 'first install' for every account, huh...
        return;
    }
    _opCounter = 0; //reset to start of queue
    _operations = data;
    _server2localMap.clear(); //empty mappings
    //_isListenersOn = false; //turn off listeners or each op will trigger a new op
    listenersOff();
    console.log("Found " + data.length + " operations on server.  Processing them.");
    sendStatus("Found " + data.length + " new operations on server.");
    processNextOp(data);
    // updateTime(); //don't use local time, use server?  Or use last operation's OPtimestamp?
}

function sendStatus(message, close = false) {
    if (document.getElementById('status')) { //if a status div is in the DOM just set it directly
        document.getElementById('status').innerHTML += (message + "<br>");
    } else {
        if (isPopupVisible()) { //needed for firefox
            chrome.runtime.sendMessage({ command: "status", message: message }); //sometimes doesnt work?
        }
        if (close) {
            chrome.runtime.sendMessage({ command: "close" });
        }
    }
}

function processNextOp() { //assumes values exist in _operations and _opCounter was set
    toggleIcon();
    if (allOpsComplete()) {
        _iconOn = true;
        chrome.browserAction.setIcon({ path: 'icons/icon_96_on.png' }); //change icon
        return;
    }
    operation = _operations[_opCounter];
    _opCounter += 1;
    operation.url = urldecode(operation.url);
    console.log(operation);
    // //if this add operation came from this client, do nothing, since the only way it got to the database was by being applied on this client first
    //  //EDIT: sadly, no.  Say we changed something in client 1 and changed it back in client 2. If we update from client 2, we need it to get the most recent change, even if it was from itself
    op = operation["operation"];
    op = op.toUpperCase();
    // console.log("checking operation " + op);
    if (op == "ADD") {
        if (isSpecialNode(operation)) { //cant add special nodes, but we can record their IDs so we can add things properly
            var specId = getSpecialId(operation); //get local id corresponding with special node
            if (!specId) { //does that folder exist here?
                createifnotexist(operation); //make a folder and pretend its special
            } else {
                mapSpecialId(operation, specId);
                processNextOp();
            }
        } else {
            createifnotexist(operation); //we have to search for it and create it in the same function due to the way callbacks work
        }
    } else if (op == "DELETE") {
        deleteNode(operation);
        //processNextOp();
    } else if (op == "RENAME") {
        renameNode(operation);
    } else if (op == "MOVE") {
        moveNode(operation);
    }
}

function mapSpecialId(operation, specialId) { //fills in the server2localMap with special folders mapping
    try {
        //figure out what the corresponding existing ID is and update our mapping
        if (specialId != operation.origId) {
            _server2localMap.set(operation.origId, specialId);
            console.log("setting " + operation.origId + ", (" + typeof(operation.origId) + ") to " + specialId + ", (" + typeof(specialId) + ")");
        }
    } catch (e) {
        console.log(e); // stupid database fills in blank values with '0' which makes the system think its the root.  
    }
    return;
}

function getSpecialId(node) {
    // console.log("isSPecialNode() check");
    if (isRoot(node)) {
        return _rootId;
    } else if (isToolbar(node)) { //firefox and chrome
        return _bookmarksBarId;
    } else if (isOtherBookmarks(node)) { //firefox and chrome
        return _otherBookmarksId;
    } else if (isBookmarksMenu(node)) { //firefox
        return _bookmarksMenuId;
    } else if (isMobileBookmarks(node)) { //firefox
        return _mobileBookmarksId;
    }
    return false;
}

function allOpsComplete() {
    if (_opCounter == _operations.length) { //if we are done
        console.log("All ops completed.  Update time, turn on listeners again");
        _isListenersOn = true; //go back to listening
        updateTime(_operations[_operations.length - 1].OPtimestamp); //return largest timestamp (should be the last operation - there will be crazy happenings if it isnt)
        sendStatus("Transfers Complete.");
        //this may be called many times in a row, since we recurse call processNextOp.? ugh X_X
        return true;
    }
    return false;
}

function deleteNode(node) {
    function callback(result) {
        // console.log("delete callback.");
        // console.log(result);
        if (chrome.runtime.lastError) {
            console.log("delete Failure (probably already deleted): " + chrome.runtime.lastError.message);
        }
        processNextOp();
    }
    //should do some double-checking here to make sure its the right ID :/
    if (node.url) { //its a bookmark
        chrome.bookmarks.remove(server2local(node.id), callback);
    } else { //its a folder
        chrome.bookmarks.removeTree(server2local(node.id), callback);
    }
}

function renameNode(node) {
    //should do some double-checking here to make sure its the right ID :/
    changeObj = {
        title: node.title
    }
    if (node.url) { //folders dont have url
        changeObj.url = node.url;
    }
    console.log("calling rename");
    console.log(changeObj);
    console.log("server2local(node.id):" + server2local(node.id));
    chrome.bookmarks.update(server2local(node.id), changeObj, function(renameresult) {
        console.log("rename callback.");
        console.log(renameresult);
        if (chrome.runtime.lastError) {
            console.log("rename Failure: " + chrome.runtime.lastError.message);
            processNextOp();
            return;
        }
        //check for duplicates
        //if they renamed something on one client, then installed a second client, we want the operations to be applied to the second client, even though the bookmarks now seem to have nothing in common
        // a simple workaround is just detect if a rename operation renamed to an existing name.  Rather than now have 2 of the same bookmark, just delete one
        searchObj = { title: renameresult.title, url: renameresult.url };
        chrome.bookmarks.search(searchObj, function(searchresults) {
            var slen = searchresults.length;
            if (slen > 1) { //duplicates were found
                //but we also want to check parents
                for (i = 0; i < slen; i++) {
                    searchresult = searchresults[i];
                    if (isSameParent(renameresult, searchresult)) {
                        // same url, title, parent - definitely a duplicate
                        if (searchresult.url) { //if its a bookomark
                            console.log("duplicate found.  deleting " + renameresult.title);
                            deleteNode(searchresult); //duplicate found
                        } else { //its a folder
                            //we need to merge.  Skip for now - or just do that in removeDuplicates?
                        }
                    }
                }
            }
        });
        processNextOp();
    }); //why am i getting "Can't find parent bookmark for id" here?????
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

function moveNode(node) {
    function callback(result) {
        // console.log("move callback.");
        // console.log(result);
        if (chrome.runtime.lastError) {
            console.log("movenode Failure: " + chrome.runtime.lastError.message);
        }
        processNextOp();
    }
    //should do some double-checking here to make sure its the right ID :/
    moveObj = {
        parentId: server2local(node.parentId)
    }
    if (node.folderindex >= 0) {
        moveObj.index = parseInt(node.folderindex);
    } else {
        console.log("error.  Folder Index is < 0"); //not sure why this happens
    }
    // console.log("calling move()");
    chrome.bookmarks.move(server2local(node.id), moveObj, callback);
}

function createifnotexist(operation) { //check if id exists
    
    //first check if it was already created by a previous update (we might be in a forced refresh)
    chrome.bookmarks.get(operation.id, 
        function(results) {
            if (chrome.runtime.lastError) {
                console.log("get() callback: " + chrome.runtime.lastError.message + " " + operation.id);
                //assume it just didn't exist and create it
                createifnotexistCont(operation); //keep going
            } else if (!results || results.length == 0) {
                createifnotexistCont(operation);
            } else {
                console.log("id found - not creating.");
                //console.log(results);
                if (operation.origId == undefined) {
                    console.log("ERROR.  No origId");
                    console.log(operation);
                }
                //populate server2client.  In the case of client1 renaming something that exists on client2, but before client2 sent its id, we will need to translate that other client id to this client id.  Fortunately all ops are saved so when we try to add it, we search for it here and find its id
                if (operation.origId != results[0].id) {
                    console.log("setting server2local " + operation.origId + " to " + results[0].id);
                    _server2localMap.set(operation.origId, results[0].id);
                }


                processNextOp();
            }
    });
}

function createifnotexistCont(operation) { //scan tree for matching title, url, and parents - uses bookmarks.search() which requires a callback  //continue on after checking if id already exists
    //create inline callback so we can use operation variable in callback
    var callback = function(results) { //results is an array of matching nodes (if any)
        // console.log("search " + operation.title + " results:");
        // console.log(results);
        if (chrome.runtime.lastError) {
            console.log("createifnotexist Failure: " + chrome.runtime.lastError.message + " " + operation.id);
        }
        if (!isSameParent(operation, results)) { //same name but not same parent! (also catches no results)
            // console.log("Creating!");
            // console.log(_server2localMap);
            createBookmark(operation);
        } else {
            console.log("Duplicate found on client - not creating.");
            //console.log(results);
            //populate server2client.  In the case of client1 renaming something that exists on client2, but before client2 sent its id, we will need to translate that other client id to this client id.  Fortunately all ops are saved so when we try to add it, we search for it here and find its id
            if (operation.origId != results[0].id) {
                console.log("setting server2local " + operation.origId + " to " + results[0].id);
                _server2localMap.set(operation.origId, results[0].id);
            }
            processNextOp();
        }
    }
    //do a search by title/url
    var searchObj = {
        title: operation.title
    };
    if (operation.url != "") { //folders have no URL
        searchObj.url = operation.url;
    }
    try {
        console.log("searching client for:");
        //console.log(operation);
        console.log(searchObj);
        chrome.bookmarks.search(searchObj, callback); //searching for an empty url will still return results with a url - we don't want that so we have to manually check the url too?  //firefox bugs out if url doesn't start with http
    } catch (e) {
        console.log(e);
        processNextOp(); //any error, (like searching for a separator) keep going
    }
}

function isSameParent(operation, results) {
    var i;
    var rlen = results.length;
    if (!results || rlen == 0) {
        console.log("No results found.  Creating on client! " + operation.title);
        return false;
    }
    for (i = 0; i < rlen; i++) { //loop through all matches, check if parents match too
        node = results[i];
        console.log(i + " " + operation.title + " comparing node.parentId: " + node.parentId + " with server2local(operation.parentId(" + operation.parentId + ")): " + server2local(operation.parentId));
        if (node.parentId == server2local(operation.parentId) || server2local(operation.parentId) == _rootId) { //is it added to the root?   we found an unaccounted for special folder(only happens when we try to find firefox-only folders in chrome
            // console.log("parents are the same. " + node.parentId + " " + server2local(operation.parentId));
            //record the change in ids (if any)
            _server2localMap.set(operation.id, node.id);
            return true; // a match was found, do not create it.
        }
    }
    console.log("found but not same parent. rlen:" + rlen + "  Creating on client " + operation.title); //does this ever even happen?  Is this entire function needed?
    console.log(results);
    console.log(typeof results);
    return false;
}
//singular create
function createBookmark(operation, includeIndex = true) { //happens after duplicate check
    //create our success function  
    var callback = function(result) {
        //console.log("Results from create " + node.title +":");
        //console.log(result);
        creationCallback(operation, result);
    }
    bookmark = node2bookmark(operation, includeIndex);
    console.log("\nAttempting to create : " + bookmark.title + "\n original parentId:" + operation.parentId + "  new parentId:" + server2local(operation.parentId));
    chrome.bookmarks.create(bookmark, callback); //the money line
}

function creationCallback(operation, result) {
    // console.log("creationCallback node,result");
    // console.log(node);
    // console.log(result);
    if (chrome.runtime.lastError || !result) {
        console.log("create Failure: " + chrome.runtime.lastError.message);
        console.log(operation);
        console.log(_server2localMap);
        // console.log(server2local(operation.parentId));
        if (chrome.runtime.lastError.message == "Index out of bounds.") { //not sure why this happens.  maybe index aren't 0 based?
            console.log("trying again!");
            createBookmark(operation, false); //try it again without the index
            return;
        }
        processNextOp();
        return;
    }
    // console.log("setting id to id" + operation.id + "=" + result.id);
    //store a mapping of how the old id became the new idea - this will be used to adjust parentIds - we also try to do this in server in changeOpId(), but for newly added Ids we need this
    try {
        _server2localMap.set(operation.origId, result.id);
    } catch (e) {
        console.log(e);
        console.log("operation, createresult");
        console.log(operation);
        console.log(result);
    }
    //inform the server of the new ids.
    newIds = { origClient: operation.parentClient, newClient: _clientID, origId: operation.origId, newId: result.id, newParentId: result.parentId }; //refer to listener.php updateIds()
    console.log("inform server of old:" + operation.origId + "  to new id: " + result.id);
    //console.log(operation);
    //console.log(newIds);
    sendToPhp("addedId", newIds);
    processNextOp();
}

function node2bookmark(node, includeIndex = true) {
    //create bookmark object suitable for create()
    var bookmark = {};
    // if(pND) console.log("creating bookmark "+node.title+", parentId: " + node.parentId + " -> " + old2new[node.parentId]);
    localParentId = server2local(node.parentId); //find client's name for that bookmark
    //sometimes special folders don't exist, so we know its a special folder but we don't have an ID for it, so just add it to the 'other bookmarks' folder.  It should still be caught by isSpecial() checking
    if (localParentId == _rootId) { //it will error if we try to add to the root
        console.log("unaccounted for special folder.  Moving to other bookmarks and pretending its special");
        localParentId = _otherBookmarksId;
    }
    bookmark["parentId"] = localParentId; //replace it with the existing folder id
    if (includeIndex) bookmark["index"] = parseInt(node.folderindex); //index doesn't always line up if we moved folders around I don't update index
    bookmark["title"] = node.title;
    if (node.url != "") { //folders dont use urls
        bookmark["url"] = node.url;
    }
    return bookmark;
}

function storeTreeIds(tree) { //used  for  adding things to those uneditable folders
    // //console.log("rootId:" + rootId + "  toolbarId:" + bookmarksBarId + "  Other bookmark id:"  + otherBookmarksId);
    if (!_rootId) { //should only have to do this once since these special folders never change
        tree = tree[0];
        _localTree = tree; //store the entire tree
        _rootId = tree.id;
        var i;
        for (i = 0; i < tree.children.length; i++) { //get all children in root
            var node = tree.children[i];
            if (!node || !node.id) continue; //set to null in removeduplicates?
            if (isToolbar(node)) { //firefox and chrome
                _bookmarksBarId = node.id;
            } else if (isOtherBookmarks(node)) { //firefox and chrome
                _otherBookmarksId = node.id;
            } else if (isBookmarksMenu(node)) { //firefox
                _bookmarksMenuId = node.id;
            } else if (isMobileBookmarks(node)) { //firefox
                _mobileBookmarksId = node.id;
            }
        }
    }
    //    addAllSpecialFolders();  // all special folders are in root, so when adding, just check if parent id is root and change it to otherBookmarks!  doesn't need whole separate function
}

function isSpecialNode(node) { //certain nodes are not editable
    var specialId = null;
    // console.log("isSPecialNode() check");
    if (isRoot(node)) {
        return true;
    } else if (isToolbar(node)) { //firefox and chrome
        return true;
    } else if (isOtherBookmarks(node)) { //firefox and chrome
        return true;
    } else if (isBookmarksMenu(node)) { //firefox
        return true;
    } else if (isMobileBookmarks(node)) { //firefox
        return true;
    } else if (isSeparator(node)) { //firefox
        console.log("skipping.");
        return true;
    } else if (isEmpty(node)) { //firefox
        return true;
    }
    return false;
}

function isRoot(node) {
    if (node.id == "0" || node.id == "root________") { //parentId not valid to check cuz some operations don't include parent id (rename)
        // console.log("root found");
        return true; //chrome and firefox
    }
    return false;
}

function isOtherBookmarks(node) {
    if (node.id == "unfiled_____" || server2local(node.parentId) == _rootId && (node.title == "Other Bookmarks" || node.title == "Other bookmarks")) { //firefox uppercase and chrome lowercase
        return true;
    }
    return false;
}

function isToolbar(node) {
    if (server2local(node.parentId) == _rootId && (node.title == "Bookmarks Toolbar" || node.title == "Bookmarks bar" || node.id == "toolbar_____")) { //firefox and chrome
        return true;
    }
    return false;
}

function isBookmarksMenu(node) {
    if (node.id == "menu________" || node.title == "Bookmarks Menu") { //firefox
        return true;
    }
    return false;
}

function isMobileBookmarks(node) {
    if (node.title == "Mobile Bookmarks" || node.id == "mobile______") { //firefox
        return true;
    }
    return false;
}

function isSeparator(node) {
    if (node.title == "" && node.url == "data:") { //firefox
        return true;
    }
    return false;
}

function isEmpty(node) {
    if (node.title == "" && node.url == "") {
        return true;
    }
    return false;
}

function updateTime(timestamp) { //value is stored in global _lastUpdate and storage -used to keep track of last time we updated from server.  Very important!
    //    sendToPhp("lastUpdate");  //this is wrong.  I should not send a separate request for the time.  The time should be stored in the operations I process, in the unlikely case someone changes a bookmark WHILE these operations are being processed.  I should probably use the included timestamps
    chrome.storage.local.set({ lastUpdate: timestamp }); //store the last time we updated
    _lastUpdate = timestamp;
}

function urldecode(url) {
    return decodeURIComponent(url.replace(/\+/g, ' '));
}

function server2local(id) { //return the local id that corresponds with the server id
    var newId;
    var newId = _server2localMap.get(id); //problems if it doesn't exist!  Must be careful to only create one bookmark at a time and get the Id before adding next
    if (!newId || newId == null || newId == undefined) {
        //        console.log("Match not found.  using "+id);
        return id;
    }
    return newId;
}

function rebuildBookmarks() { //they clicked the rebuild button.  Deletes all bookmarks and rebuilds from OPs on server.
    toggleIcon();
    listenersOff();
    updateTime(0); //since the beginning of time
    //delete all bookmarks
    deleteAllBookmarks();
    //fetch all operations from server
    updateStart();
    storeTree();
    toggleIcon();
}

function deleteAllBookmarks() {
    console.log("Deleting all bookmarks.");
    deleteCount = 0;
    //delete/remove ALL bookmarks
    for (var i = 0; i < _localTree.children.length; i++) { //get children of root 
        var child = _localTree.children[i];
        console.log(child);
        for (var j = 0; j < child.children.length; j++) { //get children of children of root 
            var childchild = child.children[j];
            chrome.bookmarks.removeTree(childchild.id); //delete everything
        }
    }
    //localTree becomes invalid.. should delete it after all callbacks complete.  ah well. callbacks.  pfft.
}
//######################################################################################################################################################################
//############################################################## END BOOKMARKS FUNCTIONS ########################################################################################################
//######################################################################################################################################################################
function isPopupVisible() { //required for firefox before sending any message ore we get the stupid message 'recieveing end does not exist'
    var views = chrome.extension.getViews({ type: "popup" }); //https://stackoverflow.com/questions/8920953/how-determine-if-the-popup-page-is-open-or-not
    if (views.length > 0) {
        console.log("Popup is visible");
        return true;
    }
    return false;
}

function deleteHistory() {
    sendToPhp("deleteOPs"); //install happens in the callback
}

function removeDuplicates() { //just from local
    console.log("removing duplicates.");
    //technically the database does a check on every insert and if it finds a duplicate doesn't allow it.  so there should be no need to send anything to the server.
    //_isListenersOn = false;
    listenersOff();
    //get a fresh tree
    chrome.bookmarks.getTree(removeDuplicatesCont);
}

function removeDuplicatesCont(tree) {
    _localTree = tree;
    var bgen = bookmarkGenerator(tree);
    for (node of bgen) {
        if (!node.url) { //for every folder
            removeDuplicatesInFolder(node);
        }
    }
    storeTree(); //update _localtree since we probably did a bunch of changes to it
    //All donE.
    _isListenersOn = true;
}

function removeDuplicatesInFolder(folderNode) {
    var children = folderNode.children;
    var i, j, node1, node2;
    var flen = children.length;
    //compare every node against every other one in the folder
    for (i = 0; i < flen; i++) {
        for (j = i; j < flen; j++) {
            if (i == j) continue;
            node1 = children[i];
            node2 = children[j];
            if (node1.title == node2.title && node1.url == node2.url) {
                console.log("deleting " + node2.title);
                chrome.bookmarks.remove(node2.id); //always remove the j node, keep the i --this may result in multiple delete requests on the same node if there's 3 matches
            }
        }
    }
}

function tree2assoc(tree) { //turn bookmarks tree into associative array indexed by id for fast lookup without having to deal with callbacks
    var arr = {};
    var bgen = bookmarkGenerator(tree);
    var node;
    for (node of bgen) {
        arr[node.id] = node;
    }
    return arr;
}

function getParentFolders(node) {
    var parentId = node.parentId;
    var path = "";
    while (parentId) { //goes till we hit root folder
        parentNode = _localTreeAssoc[parentId]; //fast lookup
        path = parentNode.title + '/' + path; //prepend it
        parentId = parentNode.parentId;
    }
    // console.log("path of :"+node.title+" :"+path);
    return path;
}