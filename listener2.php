<?php
header('Access-Control-Allow-Origin: *');  //https://stackoverflow.com/questions/20035101/why-does-my-javascript-get-a-no-access-control-allow-origin-header-is-present
header('Content-type: application/json');  //echos a json string


//i need a way to make debug messages display without wrecking functionality so I create these globals
	//when a message needs to be sent back, use these globals
	//at the end of ALL processing these messages will ALWAYS be sent - along with it, debug messages
	//that way I get to see any errors, even if the script doesn't send anything back

//globals
	$returnCommand = "";
	$returnMessage = ""; 
	$accountData = "";
	$debugMessages = "";  //so we can still operate listener.php even with debugging on
	$localTimestamp = "";  //so we don't duplicate put operations in ops table


@include_once("settings.php");
@include_once("functions/helpers2.php");
@require_once("functions/accountFunctions.php");  //split up functions that deal with accounts and security from bookmark functions


/*

	ini_set('display_errors', 1);
	ini_set('display_startup_errors', 1);
	error_reporting(E_ALL);
*/

set_error_handler(function($errno, $errstr, $errfile, $errline, $errcontext) {  //https://stackoverflow.com/questions/1241728/can-i-try-catch-a-warning

	if(error_reporting() != 0){  //https://stackoverflow.com/questions/7421908/detect-in-custom-error-handler-if-a-php-error-was-actually-suppressed-by
		//dns_get_record();
		debugprint("ERROR ($errno) $errstr on line $errline of $errfile. ");
		//debugprint($errcontext);  //yikes this prints the password
	}

});
	


//reduce db lag
function cacheAccountData($email){  //get all data for this email from server and store it in a global variable

	$data = array();
	//get all values
	$query = "SELECT * FROM accounts2 WHERE email='$email'";
	$result = sendquery($query);
	if($result) $result = $result[0];  // we only need one row
	return $result;
}



function setParentFolders(&$node,$path=''){

	if(isset($node->id)){  //its an actual node not a list of children
		$node->parentFolders = $path;
	}

	if(is_array($node)){
		foreach($node as $n){
			setParentFolders($n,$path);
		}
	}

	if(is_object($node)){
		if(isset($node->children)){
			$path .= $node->title . "/";
			setParentFolders($node->children,$path);
		}
	}
}

function addTree($node){ //recursively get path of each node

	if(isset($node->id)){  //its an actual node not a list of children
		addToDB($node);
	}

	if(is_array($node)){
		foreach($node as $n){
			addTree($n);
		}
	}

	if(is_object($node)){
		if(isset($node->children)){
			addTree($node->children);
		}
	}
}

function fixSpecialFolders($node){  //turns firefox folder names into chrome folder names
//just string replace the following:
	//Bookmarks Toolbar -> Bookmarks Bar
	//Bookmarks Menu -> Other Bookmarks/Bookmarks Menu
	if($node->title == "Mobile Bookmarks"){
		debugprint("fix Special Folders. mobile bookmarks.  node->parentFolders:".$node->parentFolders." node->title:'$node->title'");
	}

	//toolbar
	$node->title = replaceOnce($node->title,"Bookmarks Toolbar","Bookmarks Bar");  
	$node->parentFolders = replaceOnce($node->parentFolders,"Bookmarks Toolbar","Bookmarks Bar");  

	//bookmarks menu
	$node->parentFolders = replaceOnce($node->parentFolders,"/Other Bookmarks/Bookmarks Menu/","/Bookmarks Menu/");
	$node->parentFolders = replaceOnce($node->parentFolders,"/Other bookmarks/Bookmarks Menu/","/Bookmarks Menu/");
	if($node->title == "Bookmarks Menu" && ($node->parentFolders == "/Other Bookmarks/" || $node->parentFolders == "/Other bookmarks/" )){
		//debugprint("BookmarksMenu found");
		$node->parentFolders = "/";  //just say its root all the time
	}else{
			//christ it took me forever to find this bug
				// debugprint("BookmarksMenu NOT found");
				// debugprint($node->title == "Bookmarks Menu");
				// debugprint($node->parentFolders == "/Other bookmarks/");

	}

	//mobile bookmarks
	$node->parentFolders = replaceOnce($node->parentFolders,"/Other Bookmarks/Mobile Bookmarks/","/Mobile Bookmarks/");	//firefox
	$node->parentFolders = replaceOnce($node->parentFolders,"/Other bookmarks/Mobile Bookmarks/","/Mobile Bookmarks/");  //chrome
	if($node->title == "Mobile Bookmarks" && ($node->parentFolders == "/Other Bookmarks/" || $node->parentFolders == "/Other bookmarks/")){
		$node->parentFolders = "/";  //just say its root all the time
	}
	
	

	return $node;
}

function replaceOnce($str,$from,$to){  //https://stackoverflow.com/questions/1252693/using-str-replace-so-that-it-only-acts-on-the-first-match#1252710
	$pos = strpos($str, $from);
	if($pos != false){
		//debugprint($pos."  we found a match for $from and $to.  pos:".$pos);
	}
	if ($pos !== false && $pos <= 1) {  //only find matches at the very beginning of the string
	    $str = substr_replace($str, $to, $pos, strlen($from));
	}
	return $str;
}

function addToDB($node){
	//$node = prepareForDB($node);  //make sure all values are valid
	addToOps($node);
	addToBookmarks($node);
}

function addToOps($node){ 

	global $email;
	global $timestamp;
	global $clientID;

	if(opExists($node)){  //basically check queueTimestamp - the time it got queued (local time)
		return false;
	}


	$opStr = $node->operation;
	
	// echo print_r($node);
	$tablename = $email."_OPs";
	$query = "
	INSERT INTO `$tablename`  (operation, parentClient,id,parentId,title,url,folderindex,parentFolders,dateAdded,OPtimestamp,queueTimestamp) 
	VALUES ('$opStr','$clientID','$node->id','$node->parentId','$node->title','$node->url','$node->index','$node->parentFolders','$node->dateAdded','$timestamp','$node->queueTimestamp')";
	sendquery($query);
	return true;

}

function opExists($node){
	global $email;
	global $timestamp;
	global $clientID;
	$tablename = $email."_OPs";

	$query = "SELECT *
	 FROM  `$tablename`
	 WHERE queueTimestamp = '$node->queueTimestamp' and parentClient = '$clientID' and id = '$node->id'";  //for some reason select * works - select `id` does not :(
	 $result = sendquery($query);
	 if($result){
	 	debugprint("Operation already exists");
	 	return true;
	 }
	 //debugprint("Operation does not exist.");
	 //debugprint($result);
	 return false;

}


function prepareForDB(&$node){  //&means pass by reference - modify original
	global $timestamp;


	if(is_array($node)){		//children are passed in as arrays.  Just loop through it
		array_walk($node,'prepareForDB');
		return $node;
	}

	if(isset($node->title)){
		// debugprint("Prepare $node->title for DB");
	}

	if(!isset($node->url)){
		$node->url = "";  //BUT What if they want to rename something to ''??  no change is indistinguishable from change to ''?!  
	}else{
		$node->url = urlencode($node->url);
	}

	if(!isset($node->title)){  //we must catch every little variation else it may print a warning.  even a <br> will mess up our recieving end
		$node->title = "";
	}
	//if apostrophe in title it breaks
	$node->title = htmlentities($node->title, ENT_QUOTES);  //remember to call html_entity_decode in update

	if(!isset($node->dateAdded)){  //move ops wont have dateadded
		
		$node->dateAdded = "";
	}

	if(!isset($node->index) || $node->index < 0){  //firefox randomly says index is -1 :(
		$node->index = "";
	}

	if(!isset($node->parentId)){
		
		$node->parentId = "";
	}

	if(!isset($node->parentFolders)){
		
		$node->parentFolders = "";
	
	}
	if(!isset($node->operation)){
		$node->operation = "add";  //a full tree dump won't have ops added to it.  set it here.
	}
if(!isset($node->queueTimestamp)){  //installs don't use the queue
		$node->queueTimestamp = $timestamp;  //doesn't matter what we put here
	}


	$node = fixSpecialFolders($node);
	if(isset($node->children) && count($node->children) > 0){//fortunately all the children are passed in too!  huge db saving
	 		prepareForDB($node->children);
	}


	return $node;
}



function nodeExists($tablename, $node){

	global $clientID;

		$idCol = $clientID."_id";
	  $parentIdCol = $clientID."_parentId";


		// I don't want to check parent folders, because what if they for whatever unknown reason do want to insert duplicate folders.  Theres nothing illegal about that.  I should allow it?  But if its from a differnet client it wont have an id... grrr...
		if($result = isRootFolder($tablename, $node)){
			debugprint("its a root folder.  It  always exists.");
			return $result[0];

		}
		
	//first check for exact id
		 $query="
				  SELECT $idCol,$parentIdCol,title,url,parentFolders
			    FROM `$tablename`
			    WHERE title = '$node->title' and url = '$node->url' and (parentClient = '$clientID' and $idCol = '$node->id');
			    ";  
		$result = sendquery($query);
		if($result) { 
			debugprint("Bookmark already exists in DB.  Exact Id match.");
			return $result[0];
		}


 		//exact id not found.. now try matching parentFolder - only if its from a different client.  Different ids from same client are Always different bookmarks regardless of name.
		if($node->parentFolders != ''){  //if parent folders was not supplied - don't check for matches, it will match every blank value){
	    $query="
		  SELECT $idCol,$parentIdCol,title,url,parentFolders
	    FROM `$tablename` 
	    WHERE title = '$node->title' and url = '$node->url' and parentClient <> '$clientID' and parentFolders = '$node->parentFolders';";      // only if its from a different client.  Different ids from same client are Always different bookmarks regardless of name.  I think.
		  $result = sendquery($query);
	 		
		  if($result){
		  	//I guess it's found?   Check if id is there?
				
				debugprint("Bookmark with parentfolders already exists in DB.");
				debugprint($result);

		  	return $result[0];
		  }  
	  }
	    //can't just check if IdCol = node->id in the unlikely case two different clients assign the same id to different nodes.  So we have to check if parentClient matches.
	    //if no id for that client (first time seen) then just use parentFolders
		
  return false;
	}


function isRootFolder($tablename, $node){  //check for special folders (root has no parentFolder, canot use that

	if($node->id == '0' || $node->id == 'root________'){

		global $clientID;
		
		$idCol = $clientID."_id";
		$parentIdCol = $clientID."_parentId";

		$query = "SELECT $idCol,$parentIdCol,title,url,parentFolders
	    FROM `$tablename` 
	    WHERE  title = '' and url = '' and parentFolders = ''"; 
	    $result = sendquery($query);
	    return $result;

	}
	return false;

}


function updateClientId($row,$node){ 
	 //we just added an existing bookmark.  If it came with ids from different clients, add those - or we deleted it and 'undid' it client side, but client used a new ID
	global $clientID;
	global $email;
	$idCol = $clientID."_id";
  $parentIdCol = $clientID."_parentId";
	$tablename = $email."_bookmarks";


	if($node->id != $row[$idCol]){
	  //did the no-de came from a different client?
	  debugprint("same client.  No need to update Ids.");


		debugprint("ids do not match (".$node->id.",".$row[$idCol].")updateClientIds() with values from node:");


		debugprint($node);
		debugprint("result from query.");
		debugprint($row);



	  

			//fill in the missing/new database value
			$query="
			UPDATE `$tablename` 
			SET $idCol ='$node->id'
			WHERE title = '$node->title' and url = '$node->url' and parentFolders = '$node->parentFolders';";  //we know parentfolders existed cuz thats the only way ids would be different but we still found a match
			  sendquery($query);
	  
	}

	//if($node->parentId != "" && $row[$parentIdCol] == ""){  //value exists in client side but not in database side - happens when adding to different client
	if($node->parentId != '' && $node->parentId != $row[$parentIdCol]){  //sometimes parentIds become desynced for whatever reason, so just update any time its different
			debugprint("parent Ids were off");
		//fill in the missing database value
			$query="
			UPDATE `$tablename` 
			SET $parentIdCol = '$node->parentId', parentFolders = '$node->parentFolders'
			WHERE title = '$node->title' and url = '$node->url' and ($idCol = '$node->id' or parentFolders = '$node->parentFolders');";
			 sendquery($query);
	}
	debugprint("end updateClientIds()");
}



function addedId($data){
  //addedID command routes here - does same as updateClientId except we know there there is info to update and we are given the id so we don't have to search
		//this is similar to updateClientIds except we know we have filled in Ids - we either change the originals or fill in the new client
	//newIds = {origClient: node.parentClient, newClient:_clientID, origId:node.id, newId:result.id, origParentId: node.parentId, newParentId:result.parentId};  //refer to listener.php addedId()


	debugprint("Adding Id:");
	debugprint($data);


	global $email;
	// global $timestamp;
	// global $clientID;
  

	if(!isset($data->newClient)){
		debugprint("ERror!  Client id does not exist in addedId");

		return;
	}


	$newidCol = $data->newClient."_id";
	$newparentIdCol = $data->newClient."_parentId";
	$origidCol = $data->origClient."_id";
		//$origparentIdCol = $data->origClient."_parentId";  //don't care, might not be accurate

			// $query="
			// UPDATE `$tablename` 
			// SET $newidCol = '$data->newId', $newparentIdCol = '$data->newParentId'
			// WHERE $origidCol = '$data->origId' and $origparentIdCol = '$data->origParentId'
			// ;";  //don't check parentID, because, every bookmark creation has a move operation, so the database will never have the correct id by the time it gets to the client, and client won't send accurate parent id
		  // the very next operation, the move operation fixes it database side but the client isn't going to get that in time.  So just doint bother with parentId here.  All parentIds are checked in updateParentIds, anyways.

		$tablename = $email."_bookmarks";

					$query="
			UPDATE `$tablename` 
			SET $newidCol = '$data->newId', $newparentIdCol = '$data->newParentId'
			WHERE $origidCol = '$data->origId'
			;";  //setting newParentId not necessary since I update ALL parent ids in updateParentIds which happens after every add, but redundancy is good.
			   sendquery($query);

}


function updateParentIds($node){  
//see, when a node is created on a client, it sends its id and its parent id.
	//if a different client requests that info, its ids won't match.  Specifically it won't know its parent id it should add it to on its end.
	//but if we updated everything properly, every parent should be in the bookmarks table, including its ids in both clients
	//so whenever we add a new bookmark to the server, update the parentId to include all clients, 
	//so when it is sent to a client, it will have the needed parent id 
	// (its either this method or calculate the parent folders, and even then that doesn't work if there is duplicate names)

	//TODO shoot!  do we have to update this every move operation?  I think we do!

	debugprint("updateParentIds()");


	if($node->parentId == ""){		//its the root
		return;
	}


	global $email;
	global $timestamp;
	global $clientID;

  $tablename = $email."_bookmarks";
	$idCol = $clientID."_id";
  $parentIdCol = $clientID."_parentId";




  // $subquery = "SELECT column_name
  // FROM information_schema.db2_columns
  // WHERE table_name='$tablename'
  // AND column_name LIKE '%_id';";

  //get the ids of the parent ID (it had better exist!) in database
  $query = "SELECT * from `$tablename`
  WHERE $idCol = '$node->parentId'";

  $result = sendquery($query);
  if($result) $result = $result[0];  // we only need one row
  if($result){
  	// debugprint($result);
  }else{
  	debugprint("error.  couldn't update parents for node:");
  	debugprint($node);
  	return;
  }
  //get every ID column and put that value in every ParentId column of the $node we just added
  
  $idsToAdd = array();  //new associative array
  foreach ($result as $key=>$value){
  	if(endsWith($key,"_id")){
  		if($value == "") continue;  //if theres something to update...
  		if($key == $idCol) continue;  //don't bother to update your own client - should be there already
  		//we don't know the client ids we want to fill in so just parse them from the key
  		$client = substr($key,0,-3);
  		$client = $client."_parentId";
  		$idsToAdd[$client] = $value;  //put id of parent into parent_id column of node we just added
  	}
  }

  if(count($idsToAdd) == 0){
  	debugprint("No information on parents.");
  	return;
  }

  //i want to do it all in one UPDATE statement, so we have to build the string from $idsToAdd

	$firstval = reset($idsToAdd);  //So we dont have a comma at the end  //https://stackoverflow.com/questions/6608934/popping-the-key-value-from-an-associative-array-in-php
	$firstkey = key($idsToAdd);
	array_pop($idsToAdd);  //remove first element

	

  $query = "UPDATE `$tablename` SET ";

  $query .= $firstkey . "='".$firstval."'";  //no comma on first one

	foreach ($idsToAdd as $col=>$value){
				$query .= ", " . $col . "='".$value."'";
	}
	
  	
  $query .= " WHERE $idCol = '$node->id'";  //the node we just added

	sendquery($query);
}

//https://stackoverflow.com/questions/834303/startswith-and-endswith-functions-in-php
function endsWith($haystack, $needle) {
    return substr_compare($haystack, $needle, -strlen($needle)) === 0;
}




function addClientColumn($clientID){//each client has a different id for the bookmarks so we need to give it its own column
	global $clientID;
		global $email;
		global $timestamp;
		

	  $tablename = $email."_bookmarks";

			
			$idCol = $clientID."_id";
			$parentIdCol = $clientID."_parentId";

			addCol($tablename,$idCol);
			addCol($tablename,$parentIdCol);


}		

function addCol($tablename,$colname){
	$query = "SELECT *
	            FROM INFORMATION_SCHEMA.COLUMNS
	           WHERE table_name = '$tablename'
	             AND table_schema = 'johnktejik_daxmarks'
	             AND column_name = '$colname'	";
		$result = sendquery($query);
		if (!$result){  //if results length = 0
			$query = "
	  	ALTER TABLE `$tablename` ADD `$colname` TEXT;
	  	";
	  	sendquery($query);
		}
}

function createOPtable(){

	global $email;
	$tablename = $email."_OPs";

	$query = "
			CREATE TABLE IF NOT EXISTS `$tablename` (
				operation TEXT,
				parentClient TEXT,
				title TEXT,
				url TEXT,
				folderindex INT,
				parentFolders TEXT,
				id TEXT,
				parentId TEXT,
				dateAdded BIGINT,
				OPtimestamp BIGINT,
				queueTimestamp BIGINT

				);
	";  //cannot have index as a column name it seems.. no documentaion on this
	//gotta have the numbers be text else it turns a "" into "0"
	sendquery($query);

}

function createBookmarkTable(){
	global $email;
	global $timestamp;
	global $clientID;

  $tablename = $email."_bookmarks";

	$query = "
			CREATE TABLE IF NOT EXISTS `$tablename` (
				deleted BOOL,
				parentClient TEXT,
				title TEXT,
				url TEXT,
				folderindex INT,
				parentFolders TEXT,
				dateAdded BIGINT,
				timestamp BIGINT
				);
	";  //cannot have index as a column name it seems.. no documentaion on this
	//gotta have the numbers be text else it turns a "" into "0"
	//bool type is 1 (true) or 0(false)
	sendquery($query);

}



function update($email,$client_timestamp){
//get all operations after a certain timestamp and send them to the client
		// global $debugMessages;
		global $returnCommand;
		global $returnMessage;
		global $clientID;


		if(!opTableExists()){  //its possible they use 2 accounts.  So they log into one and the firstInstall flag is set, then they create a brand new account, but the flag says its been installed already
			$returnCommand = "updateResults";
			$returnMessage = "installNeeded";
			return;
		}

		$query = "select * from `".$email."_OPs` 
		WHERE OPtimestamp >= '$client_timestamp'"; 

		//don't include operations created by the requesting client since to have gotten into the db, it already happened on that client!  (is it possible order will be messed up??  hmm.. can't think of a situation where this breaks)
		//AND parentClient <> '$clientID'  //sadly, no.  Say we changed something in client 1 and changed it back in client 2. If we update from client 2, we need it to get the most recent change, even if it was from itself

		 
		$result = sendquery($query);

		if(!($result)){ //nothing to update!
			$returnCommand = "updateResults";
			$returnMessage = "";
			return;
		}


		$result = changeOpId2ClientId($result);//right now ops only keep track of one client ids. all ids are in _bookmarks table so we need to get the appropriate id for the client
		$result = decodeHtml($result);  //we had to encode apostrophes in prepareForDb

		$returnCommand = "updateResults";
		$returnMessage = $result;
}

function opTableExists(){

	global $clientID;
	global $email;
	$tablename = $email."_OPs";

	$query = "SELECT * FROM INFORMATION_SCHEMA.TABLES 
           WHERE TABLE_SCHEMA = 'johnktejik_daxmarks' 
           AND  TABLE_NAME = '$tablename'";
	
	$result = sendquery($query);
	if($result) $result = $result[0];
	if($result){
		return true;
	}
	return false;
}

function decodeCallback(&$row,$key){  //& means pass as reference, ie update the original
	if(isset($row['title'])){
			//debugprint("decoding ".$row['title'] ." to ".html_entity_decode($row['title'], ENT_QUOTES));
			$row['title'] = html_entity_decode($row['title'], ENT_QUOTES);  //allows us to store apostrphes properly
		}
}
function decodeHtml($result){

		array_walk($result,'decodeCallback');
		return $result;
}



function changeOpId2ClientId($operations){//right now ops only keep track of one client ids. all ids are in _bookmarks table so we need to get the appropriate id for the client

	global $email;
	global $clientID;

	debugprint("changeOpId2ClientId().  ClientId:".$clientID);

	$idCol = $clientID."_id";
	$parentIdCol = $clientID."_parentId";  //these are the columns we need to use, not the ids stored in the Op table
  $tablename = $email."_bookmarks";
  $newoperations = array();

	// $rlen = count($operations);
	foreach($operations as $row){
		
		//save original ids, just in case
		$row['origId'] = $row['id']; //add operations we want to keep the original ID so we can send back an 'addedId' command which links the ids between different clients
		$row['origParentId'] = $row['parentId']; //add operations we want to keep the original ID so we can send back an 'addedId' command which links the ids between different clients



		$parentClient = $row['parentClient'];
		if($parentClient == $clientID){
				// debugprint($row['title'] ." same client.");
				array_push($newoperations,$row);  //add it.  Ids should already match
				continue;  //the OP was created by the current client, ids should already be correct
		}

		$opidCol = $parentClient.'_id';
		$opparentIdCol = $parentClient.'_parentId';

		//search bookmarks table for matching ID (itd' better be there)
		$query = "select $idCol, $parentIdCol from `$tablename`
		WHERE $opidCol = '".$row['id']."'";
		$result = sendquery($query);
		if($result) $result = $result[0];  // we only need one row
		// debugprint($result);
	
		//change the ids to match the client
		if($result[$idCol] || $result[$idCol]==="0"){  //make sure there is an id for the other client.  It thinks 0 = false?
			//it doesn't exist in bookmarks - we haven't added it to client yet so haven't seen its id.
		  //just leave the parentId as-is and hope that the client will be able to figure out which folder it belongs to.	 (just call server2client())
			if( $row['id'] != $result[$idCol]){
				debugprint("server updating id from ".$row['id']." to ".$result[$idCol]);
				$row['id'] = $result[$idCol];  //update the ids to match the client
			}
			//continue;
		}else{
			debugprint("Warning.  changeOpId2ClientId couldn't find proper client id for ".$row['title'].".  Possibly doesn't exist on client.");
			//debugprint("  result[$idCol]:".$result[$idCol]);

		}


		//make sure parentId is valid		//if parents arent there then we didn't call updateParentIds, or something broke
		if($result[$parentIdCol] || $result[$parentIdCol]==="0"){		

			//if there's no parent id, then the parent folder did not get added to the client or did not send back the Id yet.
			//this means it was added recently, and assuming the browser was not suddenly closed or reset or whatever between adding that folder and adding this bookmark,
			//the client will have a data structure _server2client[] which should contain the correct mapping between server and client. 
			//so just leave the parentId as-is and hope that the client will be able to figure out which folder it belongs to.
			if( $row['parentId'] != $result[$parentIdCol]){
					debugprint("server updating parentid from ".$row['parentId']." to ".$result[$parentIdCol]);
					$row['parentId'] = $result[$parentIdCol];  //use corrent client id
				}}

				array_push($newoperations,$row);  //add it to new results

			}

	return $newoperations;

}


function processQueue($data){

		foreach($data as $node){
			
			$node = prepareForDB($node);  //we cannot allow even a warning to pop up - make sure all values have something 
			$addresults = addToOps($node);  //we don't want to readd the same thing, nor keep creating/deleting the same thing!

			if(!$addresults){  //it already existed
				continue;
			}

			$op = $node->operation;
			$op = strtolower($op);

			if($op == 'add'){
				addToBookmarks($node);
			}else if($op == 'delete'){
				deleteFromBookmarks($node);
			}else if($op == 'move'){
				moveBookmark($node);  //just update parentIds?  change parentclient?
			}else if($op == 'rename'){
				renameBookmark($node);  //just change title or url
			}
		}
}

function addToBookmarks($node){
	global $email;
	global $timestamp;
	global $clientID;


	debugprint("Add to bookmarks. Checking.  node->parentFolders:".$node->parentFolders." node->title:'$node->title'");

  $tablename = $email."_bookmarks";
	$idCol = $clientID."_id";
  $parentIdCol = $clientID."_parentId";

  if($result = nodeExists($tablename, $node)){  //if node exists we should only have to update its ids... and only if they are empty?  //is there any situation where we add bookmarks that already exist??  install should only happen once...
  	
			//If ids do not match for whatever reason (like undo/redo created a new id for the same bookmark), update those IDs
			updateClientId($result,$node); 

			undelete($node);  //if it exists, make sure its 'deleted' flag is undone.
  	
  }else{

		$query="
	  INSERT INTO `$tablename`  
	  (parentClient,$idCol,$parentIdCol,title,url,folderindex,parentFolders,dateAdded,timestamp)
	   VALUES ('$clientID','$node->id','$node->parentId','$node->title','$node->url','$node->index','$node->parentFolders','$node->dateAdded','$timestamp')";
	    sendquery($query);
  }

  if(isQuerySuccess()){
		// global $successes;
		// $successes += 1;
  }else{
		//global $failures;
		//$failures += 1;
  	debugprint("add query failed");
  }

  //find matching parent ids, fill them in
  updateParentIds($node);
}

function undelete($node){
//if it exists, make sure its 'deleted' flag is undone.
	global $clientID;
global $email;
$tablename = $email."_bookmarks";
	  $tablename = $email."_bookmarks";
	$idCol = $clientID."_id";


		if($node->parentFolders == ''){

			$query="
		  	UPDATE `$tablename`
		  	SET deleted = ''
		    WHERE title = '$node->title' and url = '$node->url' and parentClient = '$clientID' and $idCol = '$node->id'";
	  }else{  //parentFolders is more reliable, if they exist.  But if they don't, searching for '' will search for anything :(
				$query="
				  	UPDATE `$tablename`
				  	SET deleted = ''
				    WHERE title = '$node->title' and url = '$node->url' and ((parentClient = '$clientID' and $idCol = '$node->id') or parentFolders = '$node->parentFolders')";
	
		}
		sendquery($query);  	
}


function deleteFromBookmarks($node){
	
	//if(!isset($node)) return;
	//echo print_r($node);


	global $email;
	global $clientID;
	$idCol = $clientID."_id";
	$parentIdCol = $clientID."_parentId";
  $tablename = $email."_bookmarks";


  //if we delete nodes, we will not have any way to match client ids to other clients - so we HAVE to keep all bookmarks around.  So create a 'deleted' flag and set that
		// $query = "DELETE FROM `$tablename`
		//     WHERE title = '$node->title' and $idCol = '$node->id';";  //title should always match if id matchs but can't hurt, right?


		$query = "UPDATE `$tablename`
				SET deleted = '1'
		    WHERE title = '$node->title' and $idCol = '$node->id';";  //title should always match if id matchs but can't hurt, right?
	    sendquery($query);


		    //id must be true - parent folders could be a problem if duplicate folders!  //todo test
		    //what if they delete something where the ID doesn't match?  Or from a different client?
		    //do we really want to delete?  Shouldn't we save the id for other clients for easier deletion?  They wouldn't have to search client side...
		    //shoot!  We also need to delete all children!
	 if(isset($node->children)){//fortunately all the children are passed in too!  huge db saving
	 		array_walk($node->children,'deleteFromBookmarks'); //delete all its children
	  }
}



function moveBookmark($node){  //just change parent id and index - however no guarantee the id matches the client that created it so we need to change the ids to match the new client
global $email;
	global $clientID;
	$idCol = $clientID."_id";
	$parentIdCol = $clientID."_parentId";
	
  $tablename = $email."_bookmarks";

	//allow duplicates or not?  Well, whats the default behavior of the browser?
	// if($result = nodeExists($tablename,$node)){  //do not allow duplicates
	// 	debugprint("Move operation.  $node->title into location with identical.  Deleting.");

	// 	if(isFolder($node)){
	// 		mergeFolders($node,$result);  //put $node into $result
	// 	}else{
 //  		deleteFromBookmarks($node);
 //  	}
	// }else{
		$query = "UPDATE `$tablename`
		SET $parentIdCol = '$node->parentId', parentClient = '$clientID', folderIndex = '$node->index'
		    WHERE $idCol = '$node->id';";  //we only know the ID.. gonna be tricky if was added by different client
		    sendquery($query);



		      //find matching parent ids, fill them in
  			updateParentIds($node);

		    //need to update parentFolder too!
				$node->parentFolders = getParentFolders($node);  //update the _parentId columns to match this parentId.

		
	// }


}

function renameBookmark($node){
	global $email;
	global $clientID;
	$idCol = $clientID."_id";
	$parentIdCol = $clientID."_parentId";
	
  $tablename = $email."_bookmarks";

  //allow or not?  Well, whats the default behavior of the browser?
	// if($result = nodeExists($tablename,$node)){  //do not allow duplicates
	// 	debugprint("Move operation.  $node->title into location with identical.  Deleting.");
		
	// 	if(isFolder($node)){
	// 		mergeFolders($node,$result);  //put $node into $result
	// 	}else{
 //  		deleteFromBookmarks($node);
 //  	}
	// }else{
		$query = "UPDATE `$tablename`
		SET title = '$node->title', url = '$node->url'
		    WHERE $idCol = '$node->id'
		    ;";
		    sendquery($query);

		    //technically, if its a folder, we should update EVERY childs parentFolders!  eep!

	// }
}

function isFolder($node){
	if(isset($node->children) || $node->url == ''){
		return true;
	}
	return false;
}

function mergeFolders($from, $to){
	//change parentId of all folders in $from to id of $to

	debugprint("MergeFolders()");

	global $email;

	$clientId = $from->parentClient;  //gotta work with approrpiate column
	$parentIdCol = $clientId."_id";

	$children = getChildren($from);
	foreach($children as $node){

		$node = (object)$node;   //so we can use the faster -> syntax

		$node->parentId = $to->id;

		$node->parentFolders = getParentFolders($node);  //update the _parentId columns to match this parentId.
	}
	return;


}

function getChildren($folder){
	//get all children nodes of $folder, return results as list of nodes
	global $email;
	$clientId = $folder->parentClient;
	$parentIdCol = $clientId."_parentId";
	
	$tablename = $email."_bookmarks";
	$query = "SELECT * from `$tablename`
						WHERE $parentIdCol = '$folder->id'";
	$result = sendquery($query);
	return $result;
}


function getParentFolders($node){
	debugprint("GetParentFOlders()");
    $parent = getParent($node);
    $path = "";
    while($parent){  //goes till we hit root folder

		echo print_r($node);

        $path = $parent->title .'/'.$path;  //prepend it
        $parent = getParent($parent);
    }
    
    return $path;
  }


function getParentId($node){
	global $email;


	if(isset($node->parentId)){
		return $node->parentId;
	}

	$clientId = $node->parentClient;
	$idCol = $clientId."_id";
	$parentIdCol = $clientId."_parentId";

	if(isset($node->$parentIdCol)){
		return $node->$parentIdCol;
	}
	
	//if we just have an id, we will have to query the database
	$tablename = $email."_bookmarks";
	$query = "SELECT $parentIdCol FROM `$tablename`
						WHERE $idCol = '$node->id'";
	$result = sendquery($query);
	return $result[0];

}

function getParent($node){  //return node that is the parent 
	global $email;
	$parentId = getParentId($node);
	


	$clientId = $node->parentClient;
	$idCol = $clientId."_id";
	$tablename = $email."_bookmarks";
	$query = "SELECT * FROM `$tablename`
						WHERE $idCol = '$parentId'";
	$result = sendquery($query);
	return (object)$result[0];	

}


//testing
function getDBbs(){  //return ALL bookmarks, for comparision purposes
	global $returnCommand;  //ahh you have to do declare global at EVERY step in the stack.
	global $returnMessage;
	global $email;
	$tablename = $email."_bookmarks";
	$query = "Select * from `$tablename` WHERE deleted IS NULL OR deleted = '0'";  //its having prblems finding empty ''  <> isnt working
	$results = sendquery($query);
	$returnCommand = "getDBbs";
	$returnMessage = $results;

}

function deleteOPs(){
		global $returnCommand;  //ahh you have to do declare global at EVERY step in the stack.
	global $returnMessage;
	global $email;
	$tablename = $email."_OPs";
	$query = "DROP TABLE `$tablename`";
	sendquery($query);
	$returnCommand = "deleteOPs";
	$returnMessage = "SuccessIguess";
}

function rebuildServer(){
	global $returnCommand;  //ahh you have to do declare global at EVERY step in the stack.
	global $returnMessage;
	global $email;
	$query = "TRUNCATE TABLE `".$email."_bookmarks`";  //clear table
	sendquery($query);

}

function processCommand(){

	global $returnCommand;  //ahh you have to do declare global at EVERY step in the stack.
	global $returnMessage;
	global $accountData;
	global $email;
	global $password;
	global $clientID;
	global $timestamp;
		global $localTimestamp;

	$timestamp = time();
		$command = trim($_POST['command']);
		$email = $_POST['email'];
		$password = $_POST['password'];
		$clientID = $_POST['clientID']; 
		$localTimestamp = $_POST['localTimestamp'];  //used to uniquely identify this request
		$data = json_decode($_POST['data']);// the payload - usually a bunhc of bookmarks

		

		debugprint("command exists: $command, $email");

		//cache data so less work for database
		$accountData = cacheAccountData($email); 
		//debugprint($accountData);


		//these do not require checking  credentials
		if($command == "resetPassword"){

 			resetPassword($email, $password);
 			return;

		}else if ($command == 'createAccount'){
			
			// 			//$logstr = "$email , $command, ".$_SERVER['REMOTE_ADDR'].", , ".$_POST['browserInfo'].", ".date("d-m-Y H:i:s");
			// $logstr = "$email , $command, ".$_SERVER['REMOTE_ADDR'].", , , ".date("d-m-Y H:i:s");
			// 	logData($logstr);

				createNewAccount($email,$password,$data,$accountData);
				return;
		}else if ($command == 'resendvalidation'){
					resendValidationEmail();
					return;

		}else if ($command == 'forceValidate'){
			// $query = "UPDATE accounts2 SET validated='true', randomstr='' WHERE email='$email'";  //DO NOT LEAVE THIS FOR LIVE!!
			// sendquery($query);
			
		}



		if (!checkLogin($email,$password,$accountData)) return;  //all commands past this point require valid credentials



		if ($command == 'install'){

			createOPtable(); // create OPs table if not exists
			createBookmarkTable();
			addClientColumn($clientID);  //each client has a differnet id for the bookmarks so we need to give it its own column

			setParentFolders($data);  //modify in place.  should be done before prepareforDB cuz prepareForDB does recersive calls  //aLso done client side

			$data = prepareForDB($data);  //recursively follows up the tree on its own, so just do it once here, not in addtree or addToDB
			addTree($data);  //add all data sent, to both tables
			$returnCommand = "install";
			$returnMessage = "success";
			
	}else if ($command == 'login'){  //just checks that credentials are valid and sends ok message

			//echo json_encode(["login","success",$debugMessages]);		
			$returnCommand = "login";
			$returnMessage = "success";

		}else if ($command == 'processQueue'){
			processQueue($data);
			
			//send success signal back so we can delete the queue
			//echo json_encode(["processQueue","success",$debugMessages]);
			$returnCommand = "processQueue";
			$returnMessage = "success";

		}else if ($command == 'update'){

			update($email, $data);
			

		}else if ($command == 'addedId'){
			addedId($data);

		}else if ($command == 'getDBbs'){

			getDBbs();

		}else if ($command == 'deleteOPs'){  //delete entire OPs table, install from scratch (out of memory errors)

			deleteOPs();

		}else if ($command == 'rebuildServer'){  //delete bookmark table, rebuilds from OPs - catches errors in logic here?

		}
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////////// // END FUNCTIONS ////////////////////////////// //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////  




	register_shutdown_function('fatalErrorShutdownHandler');  //to catch FATAL ERRORs
	
	//stops that stupid timezone() warning.  
	date_default_timezone_set('America/Chicago');



	
	if(isset($_POST['command'])){

		processCommand();

	
}		//end if set command

		//when they click on links in emails
	
	if(isset($_GET['command'])){
		$command = $_GET['command'];
		debugprint($_GET);
		if($command == "validate"){
			$id = $_GET['id'];
			$email = $_GET['email'];

			validateEmail($email,$id);
		
		}elseif($command == "confirmPasswordReset"){
			$id = $_GET['id'];
			$email = $_GET['email'];
			confirmPasswordReset($email,$id);
		}
	}	


	if(!isset($_GET['command']) && !isset($_POST['command'])){	//plain vanilla browse to it
			echo $debugMessages;  //will only show if debugging is on
		}

	echo json_encode([$returnCommand,$returnMessage,$debugMessages, $localTimestamp]);  //should be the only place we send commands back to javascript - everything else should set the variables
  
?>