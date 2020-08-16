let instance_skel = require('../../instance_skel');
let actions       = require('./actions');
let presets       = require('./presets');
let feedbacks     = require('./feedbacks');
let crypto        = require('crypto');
let utility       = require('utility');
let log;
let debug;

class instance extends instance_skel {

	constructor(system, id, config) {
		super(system, id, config)

		// Keep track of authorization data
		this.auth = {
			passwordMandatory   : null,        // true if password is required by NDI Studio Monitor
			wwwAuthenticate     : null,        // Store wwwAuthenticate headers
			userpass            : null,        // Store web user:password for digest authentication
			NC                  : 0            // Nonce for digest authentication
		}

		// keep track of data found during polling
		this.pollResults = {
			ndiSources: [],            // List of sources available in NDI Studio Monitor
			activeSource: {
				host    : null,        // Active "main" source hostname
				name    : null,        // Active "main" source name
				complete: null        // Active "main" source hostname and name
			},
			activeOverlay: {
				host    : null,        // Active overlay source hostname
				name    : null,        // Active overlay source name
				complete: null        // Active overlay source hostname and name
			},
			overlayModePiP  : null,        // Overlay in PiP mode (true) or alpha mode (false)
			recording       : null,        // true if recording
			audioMute       : null        // true if audio is muted
		}

		this.waitingForResponse = false;    // Flag to keep track if we are waiting for a response to fire a callback inside connect() function
		this.active             = false;    // Flag to keep track if instance is active or not (and ignore some callback processing if inactive)

		// Keep track of setInterval and setTimeout
		this.timers = {
			pollSources         : null,        // ID of setInterval for source polling
			pollConfiguration   : null,        // ID of setInterval for configuration polling
			pollRecording       : null,        // ID of setInterval for recording polling
			reconnectTimeout    : null        // ID of setTimeout for reconnection
		}

		// Store feedback colors in one place to be retrieved later for dynamic preset creation
		this.feedbackColors = {
			active_source: {
				fg: this.rgb(255, 255, 255),
				bg: this.rgb(255, 0, 0)
			},
			active_overlay: {
				fg: this.rgb(0, 0, 0),
				bg: this.rgb(255, 255, 0)
			},
			recording: {
				fg: this.rgb(255, 255, 255),
				bg: this.rgb(255, 0, 0)
			},
			audio_mute: {
				fg: this.rgb(255, 255, 255),
				bg: this.rgb(255, 0, 0)
			}
		};

		// Store default button colors in one place to be retrieved later for dynamic preset creation
		this.defaultColors = {
			fg: this.rgb(255, 255, 255),
			bg: this.rgb(0, 0, 0)
		};
		
		Object.assign(this, {
			...actions,
			...presets,
			...feedbacks
		});
	}

	actions(system) {
		this.setActions(this.getActions());
	}

	// Check instance configuration
	checkConfig() {
		if (this.config.host !== undefined && this.config.port !== undefined && this.config.useWebPassword !== undefined && this.config.username !== undefined && this.config.password !== undefined) {
			this.auth.userpass = this.config.username + ':' + this.config.password;
			this.initConnection();
		} else {
			this.system.emit('log', 'NDI Studio Monitor', 'error', 'Failed applying instance settings, missing parameters');
			this.status(this.STATUS_ERROR, 'Missing config parameters');
		}
	}

	// Initiate the connection to NDI Studio Monitor
	initConnection() {
		if (!this.waitingForResponse) { // Prevent double firing of the connect() function
			this.connect();
		}
	}

	// Try to connect againg
	retryConnection() {
		if (this.timers.reconnectTimeout) {
			clearTimeout(this.timers.reconnectTimeout);
			this.timers.reconnectTimeout = null;
		}
		this.timers.reconnectTimeout = setTimeout(() => { this.connect() }, 1000);
	}

	// Do the real connection to NDI Studio Monitor
	// NOTE: this is a bit complicated because NDI Studio Monitor could use (or not) digest-auth and is also returning an empty realm in wwwAuthenticate which is non-standard
	connect() {
		this.status(this.STATUS_WARNING, 'Connecting...');

		// Clear polling intervals because first we need a valid connection (maybe NDI Studio Monitor has been closed and initConnection() was fired after an error)
		if (this.timers.pollSources) {
			clearInterval(this.timers.pollSources);
			this.timers.pollSources = null;
		}
		if (this.timers.pollConfiguration) {
			clearInterval(this.timers.pollConfiguration);
			this.timers.pollConfiguration = null;
		}
		if (this.timers.pollRecording) {
			clearInterval(this.timers.pollRecording);
			this.timers.pollRecording = null;
		}
		// This should never happen because retryConnection() is taking care of it. Leaving it here anyway
		if(this.timers.reconnectTimeout) {
			clearTimeout(this.timers.reconnectTimeout);
			this.timers.reconnectTimeout = null;
		}

		var path = '/';
		var url = 'http://' + this.config.host + ':' + this.config.port + path;

		// First request (without any extra header); if NDI Studio Monitor requires a web password we will get an HTTP 401 and store www-authenticate headers
		this.waitingForResponse = true;
		this.system.emit('rest_get', url, (err, result) => {
			if(this.active) {        // Prevent response handling if instance have been disabled while waiting for a response
				if (err !== null) {     // Something bad happened, mainly an ECONNREFUSED if NDI Studio Monitor is not running or unreachable
					this.status(this.STATUS_ERROR, result.error.code);
					this.log('error', 'Connection failed (' + result.error.code + ')');
					this.retryConnection();     // Keep trying to connect
				}
				else {
					if(result.response.statusCode == 200) {     // NDI Studio Monitor is not requiring a web password
						this.auth.passwordMandatory = false;
						this.waitingForResponse = false;
						if(!isNDIStudioMonitorResponse(result.data)) {      // Check if the response if from NDI Studio Monitor
							this.log('warn', 'Unespected response after connection');   // We can't be 100% sure so just put a warn in the log
						}
						if(this.config.useWebPassword === true) {     // Not expected because this.config.useWebPassword is true, but everything should work anyway
							this.status(this.STATUS_OK);    // Everything will work, no reason to raise a warning on the instance
							this.log('warn', 'Web password is not required');    // Just notify the user that web password is being ignored
							this.startPolling();     // Start to poll for sources, configuration and recording status
						} else { // Everything is fine
							this.status(this.STATUS_OK);
							this.startPolling();     // Start to poll for sources, configuration and recording status
						}
					} else if(result.response.statusCode == 401) {     // This is ok, NDI Studio Monitor may require a web password
						this.auth.passwordMandatory = true;
						if(this.config.useWebPassword === false) {     // We need to use the web password but in instance config "Use web password" is not checked
							this.status(this.STATUS_ERROR, "Web password is required for login");
							this.log('error', 'Web password is required for login');
							this.waitingForResponse = false;
						} else {     // This is correct, we want to get 401 to get www-authenticate headers if using web password
							this.status(this.STATUS_WARNING, "Logging in...");
							this.auth.wwwAuthenticate = result.response.headers['www-authenticate']; // Store www-authenticate headers

							// Second request, this time we add the "Authorization" header
							this.system.emit('rest_get', url, (err, result) => {
								if(this.active) {       // Prevent response handling if instance have been disabled while waiting for a response
									if (err !== null) {     // Something really bad happened, mainly an ECONNREFUSED if NDI Studio Monitor has been closed or became unreachable after the first connection
										this.status(this.STATUS_ERROR, result.error.code);
										this.log('error', 'Connection failed (' + result.error.code + ')');
										this.retryConnection();
									}
									else {
										this.waitingForResponse = false;
										if(result.response.statusCode == 401) {     // Login failed, username and password are wrong
											this.status(this.STATUS_ERROR, "Login failed, wrong username or password");
											this.log('error', 'Login failed, wrong username or password');
										} else if(result.response.statusCode == 200) {     // Login success
											this.status(this.STATUS_OK);
											if(!isNDIStudioMonitorResponse(result.data)) {      // Check if the response if from NDI Studio Monitor
												this.log('warn', 'Unespected response after connection');   // We can't be 100% sure so just put a warn in the log
											}
											this.startPolling();     // Start to poll for sources, configuration and recording status
										} else {     // This is unespected
											this.status(this.STATUS_ERROR, "Unespected HTTP status code: " + result.response.statusCode);
											this.log('error', "Unespected HTTP status code: " + result.response.statusCode);
											this.retryConnection();
										}
									}
								} else {     // Instance has been disabled, "fail" silently
									this.waitingForResponse = false;
								}
							}, {
								// Extra headers for rest_get
								Authorization: this.getDigestAuthHeader(result.response.req.method, result.response.req.path, this.auth.wwwAuthenticate, this.auth.userpass)
							});
						}
					} else {     // This is unespected
						this.status(this.STATUS_ERROR, "Unespected HTTP status code: " + result.response.statusCode);
						this.log('error', "Unespected HTTP status code: " + result.response.statusCode);
						this.retryConnection();
					}
				}
			} else {     // Instance has been disabled, "fail" silently
				this.waitingForResponse = false;
			}
		});
	}

	// Poll for NDI Studio Monitor sources/configuration/recording
	startPolling() {
		// Do immediately the requests
		this.getCurrentNDISources();
		this.getCurrentConfiguration();
		this.getCurrentRecordingStatus();

		// Repeat the requests at set intervals
		this.timers.pollSources         = setInterval(() => { this.getCurrentNDISources() }     , 5000);        // No need to poll aggressively
		this.timers.pollConfiguration   = setInterval(() => { this.getCurrentConfiguration() }  , 1000);        // This will be used mainly to get active sources
		this.timers.pollRecording       = setInterval(() => { this.getCurrentRecordingStatus() }, 1000);        // Milliseconds will be discarded, no need to poll faster than 1 second
	}

	// Get NDI sources available in NDI Studio Monitor
	getCurrentNDISources() {
		var path = '/v1/sources';
		var url = 'http://' + this.config.host + ':' + this.config.port + path;

		// If using web password we must set the appropriate Authorization header
		var extraHeaders = {};
		if(this.auth.passwordMandatory & this.config.useWebPassword) {
			if(this.auth.wwwAuthenticate === null) {
				this.initConnection();
				return;        // Can't go on with the function because first we need to get a valid connection; polling will resume after a successfull connection
			} else {
				extraHeaders.Authorization = this.getDigestAuthHeader('GET', path, this.auth.wwwAuthenticate, this.auth.userpass);
			}
		}

		// Send GET request to get a list of all sources (NDI, audio devices, screens, controllers...)
		this.system.emit('rest_get', url, (err, result) => {
			if (err !== null) {
				this.initConnection();        // Something went wrong, check againg the connection
			}
			else {
				if(result.response.statusCode == 200) {
					var newPresets = this.getPresets();        // Presets will be added to the basic ones

					var sources = getSafe(() => result.data.ndi_sources);

					// Store NDI sources
					if(sources !== undefined) {
						this.pollResults.ndiSources.length = 0;        // Wipe previous sources array

						// First source must always be an empty one (this is how NDI Studio Monitor sets the source to "None")
						// but is never listed in /v1/sources response so we are putting it back at the beginning of the response array.
						// In this way actions options and presets will be automatically created accounting for the "None" source.
						sources.unshift('');

						for (var n in sources) {
							var sourceName = sources[n];

							// Take care to give sources a meaningful name for the user
							var displayedText = sourceName;
							if(displayedText === '') {
								displayedText = 'None';        // If the source is an empty string, the button text should be "None" (according to NDI Studio Monitor nomenclature)
							}

							// Add the source to the array that we will use to populate the drop-down options in the actions
							this.pollResults.ndiSources.push({id: sourceName, label: displayedText});

							// Create a new preset (with feedback) to set the source as the main one
							newPresets.push({
								category: 'Sources',
								label   : sourceName,
								bank: {
									style   : 'text',
									text    : displayedText,
									size    : 'auto',
									color   : this.defaultColors.fg,
									bgcolor : this.defaultColors.bg
								},
								feedbacks: [
									{
										type: 'active_source',
										options: {
											source  : sourceName,
											fg      : this.feedbackColors.active_source.fg,
											bg      : this.feedbackColors.active_source.bg
										}
									}
								],
								actions: [
									{
										action  : 'source',
										options : {source: sourceName}
									}
								]
							});

							// Create a new preset (with feedback) to set the source as Picture in Picture one
							newPresets.push({
								category: 'Overlay PiP',
								label   : sourceName,
								bank: {
									style   : 'text',
									text    : 'Over. PiP: ' + displayedText,
									size    : 'auto',
									color   : this.defaultColors.fg,
									bgcolor : this.defaultColors.bg
								},
								feedbacks: [
									{
										type: 'active_overlay_pip',
										options: {
											source  : sourceName,
											fg      : this.feedbackColors.active_overlay.fg,
											bg      : this.feedbackColors.active_overlay.bg
										}
									}
								],
								actions: [
									{
										action  : 'overlay_pip',
										options : {source: sourceName}
									}
								]
							});

							// Create a new preset (with feedback) to set the source as alpha overlay
							newPresets.push({
								category: 'Overlay alpha',
								label   : sourceName,
								bank: {
									style   : 'text',
									text    : 'Over. alpha: ' + displayedText,
									size    : 'auto',
									color   : this.defaultColors.fg,
									bgcolor : this.defaultColors.bg
								},
								feedbacks: [
									{
										type: 'active_overlay_alpha',
										options: {
											source  : sourceName,
											fg      : this.feedbackColors.active_overlay.fg,
											bg      : this.feedbackColors.active_overlay.bg
										}
									}
								],
								actions: [
									{
										action  : 'overlay_alpha',
										options : {source: sourceName}
									}
								]
							});
						}
						this.status(this.STATUS_OK);
					} else {
						this.status(this.STATUS_WARNING, "Get NDI sources failed");
					}

					// Update presets, feedbacks and actions with new sources
					this.setPresetDefinitions(newPresets);
					this.setFeedbackDefinitions(this.getFeedbacks());
					this.actions();
				} else {
					this.initConnection(); // Something went wrong, check againg the connection
				}
			}
		}, extraHeaders);
	}

	// Get current configuration of NDI Studio Monitor
	getCurrentConfiguration() {
		var path = '/v1/configuration';
		var url = 'http://' + this.config.host + ':' + this.config.port + path;

		// If using web password we must set the appropriate Authorization header
		var extraHeaders = {};
		if(this.auth.passwordMandatory & this.config.useWebPassword) {
			if(this.auth.wwwAuthenticate === null) {
				this.initConnection();
				return; // Can't go on with the function because first we need to get a valid connection; polling will resume after a successfull connection
			} else {
				extraHeaders.Authorization = this.getDigestAuthHeader('GET', path, this.auth.wwwAuthenticate, this.auth.userpass);
			}
		}

		// Send GET request to get a list of all sources (NDI, audio devices, screens, controllers...)
		this.system.emit('rest_get', url, (err, result) => {
			if (err !== null) {
				this.initConnection();        // Something went wrong, check againg the connection
			}
			else {
				if(result.response.statusCode == 200) {
					if(result.data !== undefined) {
						// Update current active source variable and feedback
						var currActiveSource = getSafe(() => result.data.NDI_source);
						if(currActiveSource !== undefined) {
							if(currActiveSource === '') {
								this.setVariable('activeSourceComplete', 'None');
								this.setVariable('activeSourceHost', 'None');
								this.setVariable('activeSourceName', 'None');
								this.pollResults.activeSource.complete = '';
								this.pollResults.activeSource.host = '';
								this.pollResults.activeSource.name = '';
							} else {
								this.setVariable('activeSourceComplete', currActiveSource);
								this.setVariable('activeSourceHost', getHost(currActiveSource));
								this.setVariable('activeSourceName', getName(currActiveSource));
								this.pollResults.activeSource.complete  = currActiveSource;
								this.pollResults.activeSource.host      = getHost(currActiveSource);
								this.pollResults.activeSource.name      = getName(currActiveSource);
							}
						}
						this.checkFeedbacks('active_source');

						// Update current active PiP source variable and feedback
						var currActiveOverlay = getSafe(() => result.data.NDI_overlay);
						var currOverlayModePiP = getSafe(() => result.data.decorations.picture_in_picture);
						var currAudioMute = getSafe(() => result.data.decorations.mute_audio);
						if(currActiveOverlay !== undefined) {
							if(currActiveOverlay === '') {
								this.setVariable('activeOverlayComplete', 'None');
								this.setVariable('activeOverlayHost', 'None');
								this.setVariable('activeOverlayName', 'None');
								this.pollResults.activeOverlay.complete = '';
								this.pollResults.activeOverlay.host     = '';
								this.pollResults.activeOverlay.name     = '';
							} else {
								this.setVariable('activeOverlayComplete', currActiveOverlay);
								this.setVariable('activeOverlayHost', getHost(currActiveOverlay));
								this.setVariable('activeOverlayName', getName(currActiveOverlay));
								this.pollResults.activeOverlay.complete = currActiveOverlay;
								this.pollResults.activeOverlay.host     = getHost(currActiveOverlay);
								this.pollResults.activeOverlay.name     = getName(currActiveOverlay);
							}
						}
						if(currOverlayModePiP !== undefined) {
							this.pollResults.overlayModePiP = currOverlayModePiP;
						}
						if(currAudioMute !== undefined) {
							this.pollResults.audioMute = currAudioMute;
						}
						this.checkFeedbacks('active_overlay');
						this.checkFeedbacks('active_overlay_pip');
						this.checkFeedbacks('active_overlay_alpha');
						this.checkFeedbacks('audio_mute');

						this.status(this.STATUS_OK);
					} else {
						this.status(this.STATUS_WARNING, "Get configuration failed");
					}
				} else {
					this.initConnection(); // Something went wrong, check againg the connection
				}
			}
		}, extraHeaders);
	}

	// Get current recording status of NDI Studio Monitor
	getCurrentRecordingStatus() {
		var path = '/v1/recording';
		var url = 'http://' + this.config.host + ':' + this.config.port + path;

		// If using web password we must set the appropriate Authorization header
		var extraHeaders = {}
		if(this.auth.passwordMandatory & this.config.useWebPassword) {
			if(this.auth.wwwAuthenticate === null) {
				this.initConnection();
				return; // Can't go on with the function because first we need to get a valid connection; polling will resume after a successfull connection
			} else {
				extraHeaders.Authorization = this.getDigestAuthHeader('GET', path, this.auth.wwwAuthenticate, this.auth.userpass);
			}
		}

		// Send GET request to get a list of all sources (NDI, audio devices, screens, controllers...)
		this.system.emit('rest_get', url, (err, result) => {
			if (err !== null) {
				this.initConnection(); // Something went wrong, check againg the connection
			}
			else {
				if(result.response.statusCode == 200) {
					// Store current configuration
					if(result.data !== undefined) {
						// Update recording status and feedback
						var currRecording = getSafe(() => result.data.recording);
						if(currRecording !== undefined) {
							this.setVariable('recording', currRecording);
							this.pollResults.recording = currRecording;
						}
						this.checkFeedbacks('recording');

						// Update recording time
						var recDuration = getSafe(() => result.data.duration);
						if(recDuration !== undefined) {
							var time = parseInt(recDuration);
							this.setVariable('recordingTimeS', time);
							var minutes = Math.floor(time / 60);
							var seconds = time - minutes * 60;
							this.setVariable('recordingTimeMS', str_pad_left(minutes, '0', 2) + ':' + str_pad_left(seconds, '0', 2));
						}

						this.status(this.STATUS_OK);
					} else {
						this.status(this.STATUS_WARNING, "Get recording status failed");
					}
				} else {
					this.initConnection(); // Something went wrong, check againg the connection
				}
			}
		}, extraHeaders);
	}

	// Instance configuration
	config_fields() {
		return [
			{
				type    : 'text',
				id      : 'info',
				width   : 12,
				label   : 'Information',
				value   : '<b>Control for NDI Studio Monitor version > 4.<br/>For info and tips about password and how this module works (actions, feedbacks, variables, presets, custom JSON) please see the help section of the module</b>'
			},
			{
				type    : 'textinput',
				id      : 'host',
				label   : 'Host or IP:',
				width   : 12,
				default : '',
				regex   : this.REGEX_SOMETHING
			},
			{
				type    : 'number',
				id      : 'port',
				label   : 'Port: (default 80)',
				width   : 12,
				default : '80',
				min     : 1,
				max     : 65535,
				regex   : this.REGEX_PORT
			},
			{
				type    : 'checkbox',
				id      : 'useWebPassword',
				width   : 12,
				label   : 'Use web password',
				default : true
			},
			{
				type    : 'textinput',
				id      : 'username',
				label   : 'Web user: (default admin)',
				width   : 12,
				default : 'admin'
			},
			{
				type    : 'textinput',
				id      : 'password',
				label   : 'Web password: (default admin)',
				width   : 12,
				default : 'admin'
			}
		];
	}

	// Instance actions
	action(action) {
		let id      = action.action;
		let opt     = action.options;
		let NDIobj  = {};
		let page    = '';

		switch (id) {
			case 'source':
				page                = 'configuration';
				NDIobj.NDI_source   = opt.source;
				break;

			case 'overlay_pip':
				page                = 'configuration';
				NDIobj.NDI_overlay  = opt.source;
				NDIobj.decorations  = { "picture_in_picture" : true};
				break;

			case 'overlay_alpha':
				page                = 'configuration';
				NDIobj.NDI_overlay  = opt.source;
				NDIobj.decorations  = { "picture_in_picture" : false};
				break;

			case 'overlay_hide':
				page                = 'configuration';
				NDIobj.NDI_overlay  = "";
				break;

			case 'audio_mute':
				page                = 'configuration';
				NDIobj.decorations  = { 'mute_audio' : true };
				break;

			case 'audio_unmute':
				page                = 'configuration';
				NDIobj.decorations  = { 'mute_audio' : false };
				break;

			case 'rec_start':
				page                = 'recording';
				NDIobj.recording    = true;
				break;

			case 'rec_stop':
				page                = 'recording';
				NDIobj.recording    = false;
				break;

			case 'customJSON':
				page                = 'configuration';
				try {
					NDIobj          = JSON.parse(opt.customJSON);
				} catch(e) {
					if (e instanceof SyntaxError) {
						// Is it worth to notify the user that the JSON string is not valid?
					}
				}
				break;
		}

		this.sendCommand(NDIobj, page);
	}

	sendCommand(NDIobj, page) {
		var path = '/v1/' + page; //page could be one of: reconding configuration sources
		var url = 'http://' + this.config.host + ':' + this.config.port + path;
		if(page == 'configuration' && NDIobj.version === undefined) {
			NDIobj.version = 1;
		}
		var data = JSON.stringify(NDIobj);

		debug("NDIobj is: \n"+data);

		// If using web password we must set the appropriate Authorization header
		var extraHeaders = {}
		if(this.auth.passwordMandatory & this.config.useWebPassword) {
			if(this.auth.wwwAuthenticate === null) {
				this.initConnection();
				// TODO: action will fail with HTTP 401 because extraHeaders are not ready
			} else {
				extraHeaders.Authorization = this.getDigestAuthHeader('POST', path, this.auth.wwwAuthenticate, this.auth.userpass);
			}
		}

		// Send POST request
		this.system.emit('rest', url, data, (err, result) => {
			if (err !== null) {
				this.initConnection(); // Something went wrong, check againg the instance connection
			}
			else {
				if(result.response.statusCode == 200) {
					if(String(result.data).trim() != 'Configuration updated.') {
						// This should never happen if a correct JSON syntax has been sent (indipendently from the content)
						this.log('warn', 'Unespected response');    // Rise a warning in the log but keep going on
					}
				} else {
					this.initConnection(); // Something went wrong, check againg the instance connection
				}
			}
		}, extraHeaders);
	}

	destroy() {
		// Clear polling timers
		if (this.timers.pollSources) {
			clearInterval(this.timers.pollSources);
			this.timers.pollSources = null;
		}
		if (this.timers.pollConfiguration) {
			clearInterval(this.timers.pollConfiguration);
			this.timers.pollConfiguration = null;
		}
		if (this.timers.pollRecording) {
			clearInterval(this.timers.pollRecording);
			this.timers.pollRecording = null;
		}

		// Clear reconnection timeout
		if(this.timers.reconnectTimeout) {
			clearTimeout(this.timers.reconnectTimeout);
			this.timers.reconnectTimeout = null;
		}

		this.active = false;
	}

	init() {
		debug = this.debug;
		log = this.log;

		this.actions();
		this.initVariables();
		this.initFeedbacks();
		this.initPresets();
		this.active = true;
		this.checkConfig();
	}

	updateConfig(config) {
		this.config = config;
		this.actions();
		this.initVariables();
		this.initFeedbacks();
		this.initPresets();
		this.checkConfig();
	}

	initVariables() {
		var variables = [
			{ name: 'activeSourceComplete',     label: 'Active source complete name' },
			{ name: 'activeSourceHost',         label: 'Active source hostname' },
			{ name: 'activeSourceName',         label: 'Active source name' },

			{ name: 'activeOverlayComplete',    label: 'Active overlay complete name' },
			{ name: 'activeOverlayHost',        label: 'Active overlay hostname' },
			{ name: 'activeOverlayName',        label: 'Active overlay name' },

			{ name: 'recording',                label: 'Recording active' },
			{ name: 'recordingTimeS',           label: 'Recording time in seconds' },
			{ name: 'recordingTimeMS',          label: 'Recording time in minutes:seconds' }
		]
		this.setVariableDefinitions(variables)
	}

	initFeedbacks() {
		this.setFeedbackDefinitions(this.getFeedbacks());
	}

	initPresets() {
		this.setPresetDefinitions(this.getPresets());
	}

	/**
	 * getDigestAuthHeader is derived from digestAuthHeader in package digest-header by fengmk2 (MIT Licensed)
	 * to allow for realm="" (empty realm string) which NDI Studio Monitor is returning
	 */
	getDigestAuthHeader(method, uri, wwwAuthenticate, userpass) {
		var AUTH_KEY_VALUE_RE = /(\w+)=["']?([^'"]*)["']?/;
		var NC_PAD = '00000000';
		var parts = wwwAuthenticate.split(',');
		var opts = {};
		for (var i = 0; i < parts.length; i++) {
			var m = parts[i].match(AUTH_KEY_VALUE_RE);
			if (m) {
				opts[m[1]] = m[2].replace(/["']/g, '');
			}
		}

		if (opts.realm === undefined || opts.nonce === undefined || opts.nonce == '') {
			return '';
		}

		var qop = opts.qop || '';

		userpass = userpass.split(':');

		var nc = String(++this.auth.NC);
		nc = NC_PAD.substring(nc.length) + nc;
		var cnonce = crypto.randomBytes(8).toString('hex');

		var ha1 = utility.md5(userpass[0] + ':' + opts.realm + ':' + userpass[1]);
		var ha2 = utility.md5(method.toUpperCase() + ':' + uri);
		var s = ha1 + ':' + opts.nonce;
		if (qop) {
			qop = qop.split(',')[0];
			s += ':' + nc + ':' + cnonce + ':' + qop;
		}
		s += ':' + ha2;
		var response = utility.md5(s);
		var authstring = 'Digest username="' + userpass[0] + '", realm="' + opts.realm + '", nonce="' + opts.nonce + '", uri="' + uri + '", response="' + response + '"';
		if (opts.opaque) {
			authstring += ', opaque="' + opts.opaque + '"';
		}
		if (qop) {
			authstring += ', qop="' + qop + '", nc="' + nc + '", cnonce="' + cnonce + '"';
		}
		return authstring;
	}
}

function str_pad_left(string, pad, length) {
	return (new Array(length + 1).join(pad) + string).slice(-length);
}

// Prevent "cannot read property of undefined" in case of unespected object structure
function getSafe(fn) {
	try {
		return fn();
	} catch(e) {
		return undefined;
	}
}

// Get the hostname from a "hostname (source name)" formatted string
function getHost(completeName) {
	let res = completeName.substring(0, completeName.indexOf('(')-1);
	return res;
}

// Get the source name from a "hostname (source name)" formatted string
function getName(completeName) {
	let res = completeName.substring(completeName.indexOf('(')+1, completeName.length-1);
	return res;
}

// Check if the text is a response from the web server of NDI Studio Monitor
// NOTE:    there is no failproof way, if the connection is ok we get an HTML response.
//          We are looking for a match in the title but this is obviously subject to changes.
//          The returned boolean should be used with care
function isNDIStudioMonitorResponse(response) {
	return(response.indexOf('<title>NDI Studio Monitor</title>') != -1);
}

exports = module.exports = instance;