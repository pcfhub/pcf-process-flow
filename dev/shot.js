/*
 * Mounts the built control once per case for `shot.html`.
 *
 * Deliberately thin: it reuses `dev/host.js` rather than hand-rolling a
 * context, so a screenshot is produced by the same stand-in the smoke suite
 * asserts against. If the two ever disagree it is a bug in one of them, not a
 * difference between "the demo" and "the control".
 */

(function () {
    'use strict';

    var host = window.__pcfHost;
    var registration = host.captureRegistration(window);

    var STAGES = [
        { Value: 1, Label: 'Qualify', Color: '' },
        { Value: 2, Label: 'Develop', Color: '' },
        { Value: 3, Label: 'Propose', Color: '' },
        { Value: 4, Label: 'Close', Color: '' },
    ];

    var COLOURED = [
        { Value: 1, Label: 'Intake', Color: '#0f6cbd' },
        { Value: 2, Label: 'Triage', Color: '#ffd166' },
        { Value: 3, Label: 'In progress', Color: '#107c10' },
        { Value: 4, Label: 'Review', Color: '#5b2d90' },
        { Value: 5, Label: 'Closed', Color: '#c4314b' },
    ];

    var isLogo = window.location.search.indexOf('logo') !== -1;

    var CASES = isLogo
        ? [{ label: '', caption: '', options: { value: [1, 2, 3], columnOptions: STAGES } }]
        : [
            {
                caption: 'A Choice column, no configuration',
                label: 'Sales stage',
                options: { value: [1, 2, 3], columnOptions: STAGES },
            },
            {
                caption: 'Colours from the options',
                label: 'Case stage',
                options: { value: [1, 2, 3, 4], columnOptions: COLOURED, label: 'Case stage' },
            },
            {
                caption: 'Steps hidden, and the dark theme',
                label: 'Ticket status',
                dark: true,
                options: {
                    value: [1, 2],
                    columnOptions: [
                        { Value: 1, Label: 'New', Color: '' },
                        { Value: 2, Label: 'Assigned', Color: '' },
                        { Value: 3, Label: 'Working', Color: '' },
                        { Value: 4, Label: 'Resolved', Color: '' },
                        { Value: 5, Label: 'On hold', Color: '' },
                    ],
                    exclude: 'On hold',
                    label: 'Ticket status',
                },
            },
        ];

    window.__shotStart = function () {
    document.body.classList.toggle('is-logo', isLogo);

    var grid = document.getElementById('shot-grid');

    CASES.forEach(function (entry) {
        var box = document.createElement('div');

        box.className = 'shot-case' + (entry.dark ? ' is-dark' : '');

        if (entry.caption) {
            var caption = document.createElement('p');

            caption.className = 'shot-caption';
            caption.textContent = entry.caption;
            box.append(caption);
        }

        if (entry.label) {
            var label = document.createElement('span');

            label.className = 'shot-label';
            label.textContent = entry.label;
            box.append(label);
        }

        var mount = document.createElement('div');

        mount.className = 'shot-mount';
        box.append(mount);
        grid.append(box);

        var options = Object.assign({ label: entry.label, dark: Boolean(entry.dark) }, entry.options);
        var context = host.createContext(options);
        var instance = new registration.ctor();

        instance.init(context, function () {}, {}, mount);
        instance.updateView(context);
    });
    };
})();
