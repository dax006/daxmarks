<?php
	if(strlen($_POST['message']) > 4){
		mail("dax006@gmail.com" ,"Message submitted from ".$_SERVER["HTTP_HOST"],"Email: ".$_POST['replyto'] ."\nMessage:\n". $_POST['message'],$headers);

		//for testing
		//	mail("john@aviswebhosting.com","Message submitted from ".$_SERVER["HTTP_HOST"],"Email: ".$_POST['replyto'] ."\nMessage to ".$_POST['sendto']. ":\n". $_POST['message'],$headers);

		echo "message sent";

	}else{
		header('HTTP/1.1 500 Message Too Short');  //http://stackoverflow.com/questions/4417690/return-errors-from-php-run-via-ajax
        header('Content-Type: application/json; charset=UTF-8');
//        die(json_encode(array('message' => 'ERROR', 'code' => 1337)));
		die("message too short");
	}



/*
//if you want to redirect afterward
echo '
<script type="text/javascript">
		function redirect(){top.location.href = "index.html"};
		setTimeout(redirect,3000);
</script>
';

*/
?>

