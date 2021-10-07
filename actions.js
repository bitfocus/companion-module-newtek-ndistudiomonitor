module.exports = {
	getActions() {
		let actions = {}

		actions['source'] = {
				label: 'Source',
				options: [
					{
						type    : 'dropdown',
						label   : 'Video source',
						id      : 'source',
						default : "",
						choices : this.pollResults.ndiSources
					}
				]
			}

		actions['overlay_pip'] = {
				label: 'Overlay PiP',
				options: [
					{
						type    : 'dropdown',
						label   : 'Overlay PiP source',
						id      : 'source',
						default : "",
						choices : this.pollResults.ndiSources
					}
				]
			}

		actions['overlay_alpha'] = {
				label: 'Overlay alpha',
				options: [
					{
						type    : 'dropdown',
						label   : 'Overlay alpha source',
						id      : 'source',
						default : "",
						choices : this.pollResults.ndiSources
					}
				]
			}

		actions['overlay_hide'] = {
				label: 'Overlay hide'
			}

		actions['audio_mute'] = {
				label: 'Audio mute'
			}

		actions['audio_unmute'] = {
				label: 'Audio unmute'
			}

		actions['rec_start'] = {
				label: 'Rec start',
			}

		actions['rec_stop'] = {
				label: 'Rec stop'
			}

		actions['customJSON'] = {
				label: 'Custom JSON',
				options: [
					{
						type    : 'textinput',
						label   : 'Custom JSON',
						id      : 'customJSON',
						default : '{"version":1}'
					}
				]
			}

		return actions
	}
}
