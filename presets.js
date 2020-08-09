exports.getPresets = function () {
    var self = this;
    let presets = []

    presets.push({
        category: 'Basic actions',
        label   : 'Audio mute',
        bank: {
            style   : 'text',
            text    : 'Audio mute',
            size    : 'auto',
            color   : self.rgb(255, 255, 255),
            bgcolor : self.rgb(0, 100, 0)
        },
        feedbacks: [
            {
                type: 'audio_mute',
                options: {
                    fg: self.feedbackColors.audio_mute.fg,
                    bg: self.feedbackColors.audio_mute.bg
                }
            }
        ],
        actions: [
            {
                action: 'audio_mute'
            }
        ]
    });

    presets.push({
        category: 'Basic actions',
        label   : 'Audio unmute',
        bank: {
            style   : 'text',
            text    : 'Audio unmute',
            size    : 'auto',
            color   : self.rgb(255, 255, 255),
            bgcolor : self.rgb(0, 100, 0)
        },
        feedbacks: [
            {
                type: 'audio_mute',
                options: {
                    fg: self.feedbackColors.audio_mute.fg,
                    bg: self.feedbackColors.audio_mute.bg
                }
            }
        ],
        actions: [
            {
                action: 'audio_unmute'
            }
        ]
    });

    presets.push({
        category: 'Basic actions',
        label   : 'Overlay hide',
        bank: {
            style   : 'text',
            text    : 'Overlay hide',
            size    : 'auto',
            color   : self.defaultColors.fg,
            bgcolor : self.defaultColors.bg
        },
        actions: [
            {
                action: 'overlay_hide'
            }
        ]
    });

    presets.push({
        category: 'Recording',
        label   : 'REC start',
        bank: {
            style   : 'text',
            text    : 'NDI recording start',
            size    : 'auto',
            color   : self.defaultColors.fg,
            bgcolor : self.defaultColors.bg
        },
        feedbacks: [
            {
                type: 'recording',
                options: {
                    fg: self.feedbackColors.recording.fg,
                    bg: self.feedbackColors.recording.bg
                }
            }
        ],
        actions: [
            {
                action: 'rec_start'
            }
        ]
    });

    presets.push({
        category: 'Recording',
        label   : 'REC stop',
        bank: {
            style   : 'text',
            text    : 'NDI recording stop',
            size    : 'auto',
            color   : self.defaultColors.fg,
            bgcolor : self.defaultColors.bg
        },
        feedbacks: [
            {
                type: 'recording',
                options: {
                    fg: self.feedbackColors.recording.fg,
                    bg: self.feedbackColors.recording.bg
                }
            }
        ],
        actions: [
            {
                action: 'rec_stop'
            }
        ]
    });

    presets.push({
        category: 'Feedbacks',
        label   : 'Recording Time Seconds',
        bank: {
            style   : 'text',
            text    : 'REC TIME $(label:recordingTimeS)',
            size    : '14',
            color   : self.defaultColors.fg,
            bgcolor : self.defaultColors.bg
        },
        feedbacks: [
            {
                type: 'recording',
                options: {
                    fg: self.feedbackColors.recording.fg,
                    bg: self.feedbackColors.recording.bg
                }
            }
        ]
    });

    presets.push({
        category: 'Feedbacks',
        label   : 'Recording Time MM:SS',
        bank: {
            style   : 'text',
            text    : 'REC TIME $(label:recordingTimeMS)',
            size    : '14',
            color   : self.defaultColors.fg,
            bgcolor : self.defaultColors.bg
        },
        feedbacks: [
            {
                type: 'recording',
                options: {
                    fg: self.feedbackColors.recording.fg,
                    bg: self.feedbackColors.recording.bg
                }
            }
        ]
    });

    presets.push({
        category: 'Feedbacks',
        label   : 'Active source complete name',
        bank: {
            style   : 'text',
            text    : 'ACTIVE: $(label:activeSourceComplete)',
            size    : 'auto',
            color   : self.defaultColors.fg,
            bgcolor : self.defaultColors.bg
        }
    });

    presets.push({
        category: 'Feedbacks',
        label   : 'Active source name',
        bank: {
            style   : 'text',
            text    : 'ACTIVE: $(label:activeSourceName)',
            size    : 'auto',
            color   : self.defaultColors.fg,
            bgcolor : self.defaultColors.bg
        }
    });

    presets.push({
        category: 'Feedbacks',
        label   : 'Active overlay complete name',
        bank: {
            style   : 'text',
            text    : 'OVERLAY: $(label:activeOverlayComplete)',
            size    : 'auto',
            color   : self.defaultColors.fg,
            bgcolor : self.defaultColors.bg
        }
    });

    presets.push({
        category: 'Feedbacks',
        label   : 'Active overlay name',
        bank: {
            style   : 'text',
            text    : 'OVERLAY: $(label:activeOverlayName)',
            size    : 'auto',
            color   : self.defaultColors.fg,
            bgcolor : self.defaultColors.bg
        }
    });

    return presets
}
