

var port = process.env.PORT || 8001;

// Rdio
var config = {
	rdio: {
		clientId : "72atj6m5sbgbdeoc2cwv47275e",
		clientSecret : "4OBw-Wp6WW0UzN4c7c7vKg",
		redirectUri : 'http://localhost:' + port + '/rdiocallback'
	}
}
var Rdio = require('rdio')(config);

var timeoutAfter = require('timeout-after');
function unpromiseWithTimeout(promise, callback) {
	var timeoutCallback = timeoutAfter(5000, callback);
	promise.then(function(data) { timeoutCallback(null, data); }, timeoutCallback);
}

// Spotify
var SpotifyWebApi = require('spotify-web-api-node');
var spotifyApi = new SpotifyWebApi({
	clientId : '1258793184c042e0aceff3ea973b5ba3',
	clientSecret : '3a403ffd04414807aaeb3c731d80c93b'
	//redirectUri: 'http://localhost:' + port + '/callback'
});

// Server
var open = require("open");
var express = require('express');
var app = express();

var rdio;

var count = 0;

app.get('/rdiocallback', function(req, res) {
	console.log('Verifying Auth...');
	rdio = new Rdio();
	rdio.getAccessToken({code: req.query.code, redirect: config.rdio.redirectUri}, function(error) {
		if (!error) {
			console.log('Rdio_Access granted');

			// Get Spotify Credentials
			spotifyApi.clientCredentialsGrant()
				.then(function(data) {
					console.log('The access token expires in ' + data['expires_in']);
					console.log('The access token is ' + data['access_token']);

					// Save the access token so that it's used in future calls
					spotifyApi.setAccessToken(data['access_token']);

					res.redirect("/follow/1");

				}, function(err) {
					console.log('Something went wrong when retrieving an access token', err);
				}).catch(function(error) {
					console.error(JSON.stringify(error));
					res.status(500).end();
				});

		} else {
			console.error('Access Error: '+JSON.stringify(error));
			res.status(500).end();
		}
	});
});

app.listen(port);
console.log("Now listening on port "+port);




// Login to Rdio
console.log('Attempt login to Rdio');
open('https://www.rdio.com/oauth2/authorize?response_type=code&client_id=' + config.rdio.clientId + '&redirect_uri=' + config.rdio.redirectUri);
// rdio.getRequestToken(function(error, oauth_token, oauth_token_secret, results) {
// 	if (!error) {
// 		rdio_secret = oauth_token_secret;
// 		var login_url = results.login_url + '?oauth_token=' + oauth_token;
// 		console.log(login_url);
// 		open(login_url);
// 	} else {
// 		console.log('Error: '+ error.statusCode);
// 		if (error.data.indexOf('!DOCTYPE html') > -1) {
// 			var fs = require('fs');
// 			fs.writeFile("error.html", error.data, function(err) {
// 			    if(err) {
// 			        return console.log(err);
// 			    } else {
// 			    	open("error.html");
// 			    }
// 			});
// 		}
// 	}
// });

app.get("/follow/:page", function followRdioArtistsOnSpotify(req, res) {
	var page = (+req.params.page - 1) || 0;
	rdio.request({
		method: 'getArtistsInCollection',
		count: '50',
		start: page * 50
	}, function(error, results) {
		console.log('Found Rdio artists. Matching...');
		if (!error) {
			var artists = results.result;
			//console.log(tracks);
			var artistWidgetHTML = "";

			var numRequests = 0;
			artists.forEach(function(artist) {

				numRequests++;
				// Loop through Rdio Artists and try to find match in Spotify dataset

				unpromiseWithTimeout(spotifyApi.searchArtists(artist.name), function (err, matches) {
					numRequests--;
					if (!err) {
						if (artist.name !== "Various Artists") {
							console.log(artist.name+" "+artist.artistKey);
							var artistMatch = {name : ""};
							var i = 0;
							while (artist.name.toLowerCase() !== artistMatch.name.toLowerCase() ) {
								artistMatch = matches.artists.items[i++]
								console.log("matches: "+artistMatch.name);
								if (i >= matches.artists.items.count ) break;
							}

							if (artist.name.toLowerCase() === artistMatch.name.toLowerCase()) {

								artistWidgetHTML += '<iframe src="https://embed.spotify.com/follow/1/?uri=spotify:artist:'+ artistMatch.id +'&size=detail&theme=light" width="300" height="56" scrolling="no" frameborder="0" style="border:none; overflow:hidden;" allowtransparency="true"></iframe>';
								console.log('numRequests - '+numRequests);

							} else {
								console.log("Could not find match.");
							}
						}
					} else {
						console.log("Error: " + err);
					}

					if (numRequests == 0) {
						composeHTML(artistWidgetHTML, page + 2, res);
					};
				});
			});
		} else {
			console.log(error);
		}
	});
});

function composeHTML(widgetHTML, nextPage, res) {
	console.log("Displaying page...");

	var pageSource = '<!DOCTYPE html><html><head><title>Follow Your Rdio Artists</title></head><body>' + widgetHTML + '<a href="/follow/' + nextPage + '">Next Page</a></body></html>';

	console.log("page size: " + pageSource.length);

	res.send(pageSource);
}
