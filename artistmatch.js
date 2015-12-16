

var port = process.env.PORT || 8001;
var defaultRedirectUri = '/follow/1';
var pageCount = 50;

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
	promise.then(function(data) { timeoutCallback(null, data); }, timeoutCallback).catch(timeoutCallback);
}

// Spotify
var SpotifyWebApi = require('spotify-web-api-node');
var spotify = new SpotifyWebApi({
	clientId : '1c8dbe7ff1d745a0805f9ce6a7c5da09',
	clientSecret : '63d6a1d255694546ba4077f01a3d4581',
	redirectUri: 'http://localhost:' + port + '/spotifycallback'
});

// Server
var open = require("open");
var express = require('express');
var app = express();
app.set('view engine', 'jade');

var rdio;
var spotifyUser;

app.get('/rdiocallback', function(req, res) {
	console.log('Verifying Auth...');
	rdio = new Rdio();
	rdio.getAccessToken({code: req.query.code, redirect: config.rdio.redirectUri}, function(error) {
		if (!error) {
			console.log('Rdio_Access granted');
			res.redirect(spotify.createAuthorizeURL(['user-follow-modify'], 'state-not-really-needed'));
		} else {
			console.error('Access Error: '+JSON.stringify(error));
			res.status(500).end();
		}
	});
});

app.get('/spotifycallback', function(req, res) {
	console.log('Verifying Auth...');
	// Get Spotify Credentials
	spotify.authorizationCodeGrant(req.query.code)
	.then(function(authres) {
		var data = authres.body;
		console.log('The access token expires in ' + data['expires_in']);
		console.log('The access token is ' + data['access_token']);

		// Save the access token so that it's used in future calls
		// spotify.setAccessToken(data['access_token']);
		spotifyUser = new SpotifyWebApi({
			accessToken: data['access_token']
		});

		res.redirect(defaultRedirectUri);

	}, function(err) {
		console.log('Something went wrong when retrieving an access token', err);
	}).catch(function(error) {
		console.log("caught error");
		console.log(error);
		console.error(JSON.stringify(error));
		res.status(500).end();
	});

});

app.get("/follow/all", function test(req, res) {
	if (!req.query.page) {
		res.redirect(defaultRedirectUri);
		console.log('no page')

		return;
	}

	var page = (+req.params.page - 1) || 0;

	rdio.request({
		method: 'getArtistsInCollection',
		sort: 'name',
		count: pageCount,
		start: page * 50
	}, function(error, results) {
		console.log('results are in ')
		var numRequests = 0,
			artistIds = [];

		results.result.forEach(function (artist){
			if (artist.name === "Various Artists") {
				return;
			}
			numRequests++;
			unpromiseWithTimeout(spotify.searchArtists(artist.name), function (err, searchres) {
				if (err) { 
					console.log("Error searching for artist " + artist.name);
					console.log(err);

					return;
				}
				numRequests--;
				var artistMatches = searchres.body.artists.items;
				for (var i in searchres.body.artists.items) {
					if (artistMatches[i].name.toLowerCase() === artist.name.toLowerCase()) {
						console.log("Adding ID to list: " + artistMatches[i].id)
						artistIds.push(artistMatches[i].id);
						break;
					}
				}

				if (numRequests === 0) {
					unpromiseWithTimeout(spotifyUser.followArtists(artistIds), function(err) {
						res.redirect('/follow/' + (page + 1));
					});	
				}
			});
		})
	});
})

app.get("/follow/:page", function followRdioArtistsOnSpotify(req, res) {
	var page = (+req.params.page - 1) || 0;

	rdio.request({
		method: 'getArtistsInCollection',
		sort: 'name',
		count: pageCount,
		start: page * 50
	}, function(error, results) {
		console.log('Found Rdio artists. Matching...');

		if (!error) {
			var artists = results.result;
			var artistIds = [];
			var numRequests = 0;

			if (artists.length === 0 && page === 0) {
				res.render('artists', {artists: [], pageInfo: {nextPage: null, previousPage: null}})
			} else if (artists.length === 0){
				res.redirect(defaultRedirectUri);
			}

			artists.forEach(function(artist) {
				if (artist.name === "Various Artists") {
					return;
				}

				numRequests++;
				// Loop through Rdio Artists and try to find match in Spotify dataset

				unpromiseWithTimeout(spotify.searchArtists(artist.name), function (err, searchres) {
					numRequests--;
					var matches = searchres.body;
					if (!err) {
						var artistMatch = {name : ""};
						var i = 0;

						while (artist.name.toLowerCase() !== artistMatch.name.toLowerCase() ) {
							artistMatch = matches.artists.items[i++]
							console.log("matches: " + artistMatch.name + " (id: " + artistMatch.id + ")");
							if (i >= matches.artists.items.count ) break;
						}

						if (artist.name.toLowerCase() === artistMatch.name.toLowerCase()) {
							artist.match = artistMatch.id;
							console.log('numRequests - '+numRequests);

						} else {
							console.log("Could not find match for " + artist.name);
						}
					} else {
						console.log("Error: " + err);
					}

					if (numRequests == 0) {
						// done
						var pageInfo = {
							nextPage: artists.length === pageCount ? page + 2 : null,
							previousPage: page !== 0 ? page : null,
							currentPage: page + 1
						};

						res.render('artists', { artists: artists, pageInfo: pageInfo });
					};
				});
			});
		} else {
			console.log(error);
		}
	});
});

app.listen(port);
console.log("Now listening on port "+port);

// Login to Rdio
console.log('Attempt login to Rdio');
open('https://www.rdio.com/oauth2/authorize?response_type=code&client_id=' + config.rdio.clientId + '&redirect_uri=' + config.rdio.redirectUri);
