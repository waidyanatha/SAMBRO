/**
 * jQuery UI Widget for S3CalendarWidget
 *
 * @copyright 2015 (c) Sahana Software Foundation
 * @license MIT
 *
 * requires jQuery 1.9.1+
 * requires jQuery UI 1.10 widget factory
 *
 * work in progress...
 */
(function($, undefined) {

    "use strict";
    var calendarWidgetID = 0;

    /**
     * Hack for timepicker add-on to dynamically change minTime/maxTime when
     * the minimum or maximum date is selected in calendarsPicker (replicates
     * the minDateTime/maxDateTime option of $.datetimepicker).
     *
     * @param {object} inst - the calendarsPicker instance
     * @param {jQuery} timepicker - the timepicker input div
     */
    var limitTimePicker = function(inst, timepicker) {

        var selectedDate = inst.selectedDates[0],
            minDate = inst.get('minDate'),
            maxDate = inst.get('maxDate'),
            minTime = timepicker.data('minTime'),
            maxTime = timepicker.data('maxTime'),
            dp_inst = timepicker.data('datepicker'),
            tp_inst = $.datepicker._get(dp_inst, 'timepicker');

        // Reset the defaults (timepicker does not expect a dynamic change!)
        tp_inst._defaults.hourMin = 0;
        tp_inst._defaults.minuteMin = 0;
        tp_inst._defaults.secondMin = 0;
        tp_inst._defaults.hourMax = 23;
        tp_inst._defaults.minuteMax = 59;
        tp_inst._defaults.secondMax = 59;

        // Set new limits
        if (selectedDate && minDate && selectedDate.compareTo(minDate) === 0) {
            dp_inst.settings.minTime = minTime;
        } else {
            dp_inst.settings.minTime = null;
        }
        if (selectedDate && maxDate && selectedDate.compareTo(maxDate) === 0) {
            dp_inst.settings.maxTime = maxTime;
        } else {
            dp_inst.settings.maxTime = null;
        }

        // Refresh the timepicker (to get the defaults updated and the sliders adjusted)
        tp_inst._limitMinMaxDateTime(dp_inst, true);
    };

    /**
     * Hack for timepicker add-on to force-select the time (without date selection)
     *
     * @param {object} inst - the calendarsPicker instance
     * @param {jQuery} timepicker - the timepicker input div
     */
    var selectTimePicker = function(inst, timepicker) {

        // Pick up the time (set flag to prevent infinite recursion)
        inst.pickUpTime = true;
        $.datepicker._selectDate(timepicker);
        inst.pickUpTime = false;

        // timepicker._selectDate restores the header we had previously
        // removed :/ so remove it again...
        timepicker.find('.ui-timepicker-div .ui-widget-header').remove();
    };

    /**
     * Hack for calendarsPicker: do not close upon select if we have a timepicker,
     * always also pick up the time before updating the real input during onSelect
     */
    $.calendarsPicker._base_selectDate = $.calendarsPicker.selectDate;
    $.calendarsPicker.selectDate = function(elem, target) {

        var inst = this._getInst(elem),
            timepicker = inst.timepicker,
            was_inline;

        if (timepicker) {
            // Pretend that this instance is inline to keep it open after selection
            was_inline = inst.inline;
            inst.inline = true;

            // Run _base_selectDate
            // FIXME: does not highlight the selected date! (base version does not either)
            this._base_selectDate(elem, target);

            // Reset inline flag
            inst.inline = was_inline;

            // Re-apply limits for timepicker
            limitTimePicker(inst, timepicker);

            // Pick up the time
            selectTimePicker(inst, timepicker);

            // calendarsPicker._updateInput not called while inline, so do
            // it now (this also triggers the onSelect-callback to update
            // the real input)
            this._updateInput(elem);
        } else {
            // No timepicker (phew!), run base version
            this._base_selectDate(elem, target);
        }
    };

    /**
     * Hack for calendarsPicker: re-attach the timepicker after _update
     */
    $.calendarsPicker._base_update = $.calendarsPicker._update;
    $.calendarsPicker._update = function(elem, hidden) {

        var inst = this._getInst(elem),
            timepicker = inst.timepicker;

        if (timepicker) {
            timepicker.detach(); // detach before update!
            this._base_update(elem, hidden);
            inst.div.find('.ui-datepicker-group').after(timepicker);
        } else {
            this._base_update(elem, hidden);
        }
    };

    /**
     * Custom layout for calendarsPicker (tweaked themeRollerRenderer)
     *
     * - remove clear-button (rendered separately)
     * - move today-button to the bottom
     * - separate out button panel so it can be turned on and off
     */
    var cpLayoutButtonPanel = '{popup:start}<div class="ui-datepicker-header ui-widget-header ui-helper-clearfix ' +
                              'ui-corner-all">{button:today}{button:close}</div>{popup:end}';
    var cpLayout = '<div{popup:start} id="ui-datepicker-div"{popup:end} class="ui-datepicker ui-widget ' +
                   'ui-widget-content ui-helper-clearfix ui-corner-all{inline:start} ui-datepicker-inline{inline:end}">' +
                   '<div class="ui-datepicker-header ui-widget-header ui-helper-clearfix ui-corner-all">' +
                   '{link:prev}{link:next}</div>{months}' +
                   '{buttonPanel}' +
                   '<div class="ui-helper-clearfix"></div></div>';

    /**
     * calendarWidget
     */
    $.widget('s3.calendarWidget', {

        /**
         * Default options
         *
         * @prop {string} calendar - the calendar to use
         * @prop {string} language - the language for calendar localization ('' for English)
         *
         * @prop {string} dateFormat - the date format (Python strftime)
         * @prop {string} timeFormat - the time format (Python strftime)
         * @prop {string} separator - the separator between date and time
         *
         * @prop {string} minDateTime - the minimum selectable date/time (ISOFORMAT string, local timezone)
         * @prop {string} maxDateTime - the maximum selectable date/time (ISOFORMAT string, local timezone)
         * @prop {string} defaultValue - the default time for the time picker (user format, local timezone)
         *
         * @prop {bool} monthSelector - show a drop-down to select the month
         * @prop {bool} yearSelector - show a drop-down to select the year
         * @prop {string} yearRange - the range of selectable years ("min:max" or "-past:+future")
         * @prop {bool} showButtons - show the button panel
         *
         * @prop {bool} weekNumber - show the week number in the calendar
         * @prop {number} firstDOW - the first day of the week (0=Sunday, 1=Monday, ...)
         *
         * @prop {bool} timepicker - show a timepicker
         * @prop {number} minuteStep - the minute-step for the timepicker slider
         *
         * @prop {bool} clearButton - show a "Clear"-button
         *
         * @prop {string} setMin - CSS selector for target widget to set minimum selectable
         *                         date/time to the selected date/time of this widget
         * @prop {string} setMax - CSS selector for target widget to set maximum selectable
         *                         date/time to the selected date/time of this widget
         *
         * @prop {string} todayText - label for the button to go to the current date
         * @prop {string} nowText - label for the button to go to the current date/time
         * @prop {string} closeText - label for the button to close the popup
         * @prop {string} clearText - label for the "Clear"-button (can contain HTML to render an icon)
         */
        options: {

            calendar: 'gregorian',
            language: '',

            dateFormat: '%Y-%m-%d',
            timeFormat: '%H:%M',
            separator: ' ',

            minDateTime: null,
            maxDateTime: null,
            defaultValue: null,

            monthSelector: false,
            yearSelector: true,
            yearRange: '-10:+10',
            showButtons: true,

            weekNumber: false,
            firstDOW: 1,

            timepicker: false,
            minuteStep: 5,

            clearButton: true,

            setMin: null,
            setMax: null,

            todayText: 'Today',
            nowText: 'Now',
            closeText: 'Done',
            clearText: 'Clear'
        },

        /**
         * Create the widget
         */
        _create: function() {

            // Instance ID and namespace
            this.id = calendarWidgetID;
            this.namespace = '.calendar-widget-' + calendarWidgetID;

            calendarWidgetID += 1;
        },

        /**
         * Update the widget options
         */
        _init: function() {

            // var el = $(this.element);

            this.refresh();
        },

        /**
         * Remove generated elements & reset other changes
         */
        _destroy: function() {

            // Remove any existing hidden inputs
            this._removeHiddenInputs();

            // Remove any existing clear-button
            if (this.clearButton) {
                this.clearButton.remove();
            }

            // Call prototype method
            $.Widget.prototype.destroy.call(this);
        },

        /**
         * Redraw contents
         */
        refresh: function() {

            var el = $(this.element),
                opts = this.options;

            // Unbind all event handlers
            this._unbindEvents();

            // Parse and store min/max DateTime
            if (opts.minDateTime) {
                this.minDateTime = new Date(opts.minDateTime);
            } else {
                this.minDateTime = null;
            }
            if (opts.maxDateTime) {
                this.maxDateTime = new Date(opts.maxDateTime);
            } else {
                this.maxDateTime = null;
            }

            // Remove any existing hidden inputs
            this._removeHiddenInputs();

            // Attach picker-popup
            if (opts.calendar == 'gregorian') {
                this._datePicker();
            } else {
                this._calendarsPicker();
            }

            // Remove any existing clear-button
            if (this.clearButton) {
                this.clearButton.remove();
                this.clearButton = null;
            }

            // Add clear-button
            if (opts.clearButton) {
                var clearButton = $('<button class="btn date-clear-btn" type="button">' + opts.clearText + '</button>');
                $(el).after(clearButton);
                this.clearButton = clearButton;
            }

            // Bind event handlers
            this._bindEvents();
        },

        /**
         * Attach a $.datepicker instance
         */
        _datePicker: function() {

            var el = $(this.element),
                self = this,
                opts = this.options,
                dateFormat = this._transformDateFormat();

            $.datepicker.setDefaults($.datepicker.regional[opts.language]);

            if (opts.timepicker) {
                // $.datetimepicker

                // Localize timepicker
                $.timepicker.setDefaults($.timepicker.regional[opts.language]);

                el.datetimepicker({
                    minDateTime: this.minDateTime,
                    maxDateTime: this.maxDateTime,
                    defaultValue: opts.defaultValue,

                    dateFormat: dateFormat,
                    timeFormat: this._transformTimeFormat(),
                    separator: opts.separator,
                    firstDay: opts.firstDOW,
                    showWeek: opts.weekNumber,

                    changeMonth: opts.monthSelector,
                    changeYear: opts.yearSelector,
                    yearRange: opts.yearRange,
                    showButtonPanel: opts.showButtons,
                    stepMinute: opts.minuteStep,
                    showSecond: false,

                    onClose: function() {
                        var selectedDate = el.datetimepicker('getDate');
                        self._updateExtremes(selectedDate, true);
                    }
                });
            } else {
                // $.datepicker
                el.datepicker({
                    minDate: this.minDateTime,
                    maxDate: this.maxDateTime,

                    dateFormat: dateFormat,
                    firstDay: opts.firstDOW,
                    showWeek: opts.weekNumber,

                    changeMonth: opts.monthSelector,
                    changeYear: opts.yearSelector,
                    yearRange: opts.yearRange,
                    showButtonPanel: opts.showButtons,

                    onClose: function() {
                        var selectedDate = el.datetimepicker('getDate');
                        self._updateExtremes(selectedDate);
                    }
                });
            }
            this._clickFocus(el);
        },

        /**
         * Attach a $.calendarsPicker instance
         */
        _calendarsPicker: function() {

            var el = $(this.element),
                opts = this.options,
                dateFormat = this._transformDateFormat('calendarsPicker');

            // Configure calendar and locale
            var calendar,
                language = opts.language;
            try {
                calendar = $.calendars.instance(opts.calendar, language);
                $.calendarsPicker.setDefaults($.calendarsPicker.regionalOptions[language]);
            } catch(e) {
                // Invalid calendar/language => fall back to defaults
                calendar = $.calendars.instance();
                $.calendarsPicker.setDefaults($.calendarsPicker.regionalOptions['']);
            }

            // Configure themeRoller
            var renderer;
            if (opts.weekNumber) {
                renderer = $.calendarsPicker.themeRollerWeekOfYearRenderer;
            } else {
                renderer = $.calendarsPicker.themeRollerRenderer;
            }

            // Use custom layout
            var layout = cpLayout,
                buttonPanel = cpLayoutButtonPanel;
            if (!opts.showButtons) {
                buttonPanel = '<div>';
            }
            renderer.picker = layout.replace('{buttonPanel}', buttonPanel);

            // Change today-button text (consistency with datePicker)
            var currentText;
            if (opts.timepicker) {
                currentText = opts.nowText;
            } else {
                currentText = opts.todayText;
            }

            // Set as defaults
            $.calendarsPicker.setDefaults({
                renderer: renderer,
                todayText: currentText,
                closeText: opts.closeText
            });

            // Split extremes into date and time values
            var minDateTime = this.minDateTime,
                maxDateTime = this.maxDateTime,
                minDate = null,
                maxDate = null,
                minTime = null,
                maxTime = null,
                splitExtreme;

            if (minDateTime) {
                splitExtreme = this._splitExtreme(calendar, minDateTime);
                minDate = splitExtreme.date;
                minTime = splitExtreme.time;
            }
            if (maxDateTime) {
                splitExtreme = this._splitExtreme(calendar, maxDateTime);
                maxDate = splitExtreme.date;
                maxTime = splitExtreme.time;
            }

            if (opts.timepicker) {
                // $.calendarsPicker with injected $.timepicker and split inputs

                // Add hidden inputs
                var value = el.val(),
                    dt = this._split(value);
                this.dateInput = $('<input type="hidden">').insertAfter(el).val(dt.date);
                this.timeInput = $('<input type="hidden">').insertAfter(el).val(dt.time);

                // Localize
                $.timepicker.setDefaults($.timepicker.regional[opts.language]);

                // Instantiate calendarsPicker
                var self = this;
                this.dateInput.calendarsPicker({
                    calendar: calendar,

                    dateFormat: dateFormat,
                    firstDay: opts.firstDOW,

                    changeMonth: opts.monthSelector || opts.yearSelector,
                    yearRange: opts.yearRange,

                    minDate: minDate,
                    maxDate: maxDate,

                    defaultDate: +0, // drawDate will automatically be min/max adjusted
                    showTrigger: '<div>',
                    onSelect: function(input) {
                        self._updateInput();
                    },
                    onShow: function(picker, calendar, inst) {
                        self._injectTimePicker(picker, calendar, inst, minTime, maxTime);
                    },
                    onClose: function(selectedDates) {
                        var inst = this;
                        if (inst.name != 'calendarsPicker') {
                            inst = $.calendarsPicker._getInst(this);
                        }
                        // Get the selected date
                        var selectedDate = null;
                        if (selectedDates.length) {
                            selectedDate = selectedDates[0].toJSDate();
                        }

                        if (inst.timepicker) {
                            if (selectedDate) {
                                var selectedTime = self.timeInput.data('selectedTime');
                                if (selectedTime) {
                                    selectedDate.setHours(
                                        selectedTime.getHours(),
                                        selectedTime.getMinutes(),
                                        selectedTime.getSeconds()
                                    );
                                }
                            }
                            inst.timepicker.remove();
                            inst.timepicker = null;
                        }
                        self._updateExtremes(selectedDate, true);
                    }
                });

            } else {
                // $.calendarsPicker
                el.calendarsPicker({
                    calendar: calendar,

                    dateFormat: dateFormat,
                    firstDay: opts.firstDOW,

                    changeMonth: opts.monthSelector || opts.yearSelector,
                    yearRange: opts.yearRange,

                    minDate: minDate,
                    maxDate: maxDate,

                    onClose: function(selectedDates) {
                        var selectedDate = null;
                        if (selectedDates.length) {
                            selectedDate = selectedDates[0].toJSDate();
                        }
                        self._updateExtremes(selectedDate);
                    }
                });
            }
            this._clickFocus(el);
        },

        /**
         * Inject a timepicker into the calendarsPicker
         *
         * @param {jQuery} picker - the calendarsPicker widget
         * @param {calendar} calendar - the calendar instance
         * @param {object} inst - the calendarsPicker instance
         * @param {string} minTime - the minimum selectable time on the earliest date (ISO-formatted string)
         * @param {string} maxTime - the maximum selectable time on the latest date (ISO-formatted string)
         */
        _injectTimePicker: function(picker, calendar, inst, minTime, maxTime) {

            if (inst.timepicker) {
                // Do not create another one (will be re-inserted by _update)
                return;
            }

            var self = this,
                opts = this.options,
                timeFormat = this._transformTimeFormat();

            picker.find('.ui-datepicker-group').first().each(function() {
                var input = $('<div>').insertAfter($(this)),
                    lock = false;
                input.timepicker({
                    timeFormat: timeFormat,
                    stepMinute: opts.minuteStep,
                    showSecond: false,

                    showButtonPanel: false,
                    onSelect: function(input) {

                        // Update the time input
                        self.timeInput.val(input);
                        self.timeInput.data('selectedTime', $(this).datetimepicker('getDate'));

                        // Also pick up the date unless called from inside selectDate
                        if (!inst.pickUpTime) {
                            self._pickUpDate(inst);
                            self._updateInput();
                        }
                    }
                });

                // Set initial value for timepicker
                var timeInput = self.timeInput,
                    lastInput = timeInput.val();
                if (!lastInput && opts.defaultValue) {
                    // Set default value
                    lastInput = opts.defaultValue;
                    // Pick up the date and update real input
                    timeInput.val(lastInput);
                    self._pickUpDate(inst);
                    self._updateInput();
                } else {
                    // Restore last input
                    timeInput.val(lastInput);
                }
                if (lastInput) {
                    // Update the timepicker
                    var lastTime = $.datepicker.parseTime(timeFormat, lastInput);
                    input.timepicker('setTime', new Date(1970, 1, 1, lastTime.hour, lastTime.minute, lastTime.second));
                }

                var minTimeEffective = timeInput.data('minTime') || minTime,
                    maxTimeEffective = timeInput.data('maxTime') || maxTime;

                // Store minTime and maxTime in timepicker div
                input.data({minTime: minTimeEffective, maxTime: maxTimeEffective});

                // Apply min/max if necessary
                limitTimePicker(inst, input);

                // Link the timepicker input div to the calendarsPicker
                // instance so we can access it later
                inst.timepicker = input;

                // Remove the extra header (unfortunately hardcoded in timepicker if time-only)
                input.find('.ui-timepicker-div .ui-widget-header').remove();
            });
        },

        /**
         * Pick up the date from the calendarsPicker and update the
         * date input (=forced date-select)
         *
         * @param {object} inst - the calendarsPicker instance
         * @return {string} - the date input string
         */
        _pickUpDate: function(inst) {

            var dates = this.dateInput.calendarsPicker('getDate'),
                dateFormat = this._transformDateFormat('calendarsPicker'),
                datestr;
            if (dates.length) {
                datestr = dates[0].formatDate(dateFormat);
            } else {
                // Fall back to drawDate if no date has yet been selected
                datestr = inst.drawDate.formatDate(dateFormat);
            }
            this.dateInput.val(datestr);
            return datestr;
        },

        /**
         * Action when the real input field is changed by the user, for
         * calendarsPicker/timepicker combination (limited functionality)
         *
         * @param {event} event - the jQuery event
         */
        _manualInput: function(event) {

            if (!this.dateInput || !this.options.timepicker) {
                // No embedded timepicker => nothing to do (phew! :))
                return;
            }

            var el = $(this.element),
                inst = this.dateInput.data('calendarsPicker'),
                timepicker = inst.timepicker,
                currentDate = this.dateInput.val(),
                currentTime = this.timeInput.val(),
                values = this._split(el.val());

            // Handle the time part first
            if (values.time != currentTime) {
                // Time Input has changed => update the hidden time input
                this.timeInput.val(values.time);
                // Try to parse the input time
                var timeFormat = this._transformTimeFormat(),
                    selectedTime = $.datepicker.parseTime(timeFormat, values.time);
                // If successful, update the timepicker and force-select to sanitize the value
                if (selectedTime !== false && timepicker) {
                    timepicker.timepicker('setTime', new Date(1970, 1, 1, selectedTime.hour, selectedTime.minute, selectedTime.second));
                    selectTimePicker(inst, timepicker);
                }
            }

            // Now deal with the date
            var selectedDate = values.date;
            if (selectedDate != currentDate) {
                // Update the dateInput and re-direct the event to the calendarsWidget
                event.target = this.dateInput;
                this.dateInput.val(selectedDate).trigger(event);
            }

            // Update the real input from sanitized values
            this._updateInput();
        },

        /**
         * Split a date/time string into its date and time parts
         *
         * @param {string} dtstr - the date/time string
         */
        _split: function (dtstr) {

            var opts = this.options,
                sep = opts.separator,
                timeFormat = opts.timeFormat,
                tlen = timeFormat.split(sep).length,
                parts = dtstr.split(sep),
                plen = parts.length;

            if (plen > 1) {
                return {
                    date: parts.splice(0, plen - tlen).join(sep),
                    time: parts.splice(0, tlen).join(sep)
                };
            }
            return {
                date: dtstr,
                time: ''
            };
        },

        /**
         * Helper function to split an extreme into date/time parts
         * for calendarsPicker/timepicker combination
         *
         * @param {object} calendar: the calendar
         * @param {Date} jsDate: the JS Date
         */
        _splitExtreme: function(calendar, jsDate) {

            return {
                date: calendar.fromJSDate(jsDate),
                time: ('0' + jsDate.getHours()).slice(-2) + ':' +
                      ('0' + jsDate.getMinutes()).slice(-2) + ':' +
                      ('0' + jsDate.getSeconds()).slice(-2)
            }
        },

        /**
         * Join date and time strings into a combined date/time string
         */
        _join: function(datestr, timestr) {

            return [datestr, timestr].join(this.options.separator);
        },

        /**
         * Update the real input from the hidden date and time inputs
         */
        _updateInput: function() {

            var el = $(this.element),
                date = this.dateInput.val(),
                time = this.timeInput.val();

            el.val(this._join(date, time));
        },

        /**
         * Remove any existing hidden inputs
         */
        _removeHiddenInputs: function() {

            if (this.dateInput) {
                this.dateInput.remove();
                this.dateInput = null;
            }
            if (this.timeInput) {
                this.timeInput.remove();
                this.timeInput = null;
            }
        },

        /**
         * Transform the date format (Python strftime) into a datepicker
         * or calendarsPicker format string
         *
         * @param {string} variant - the picker variant (default=datepicker)
         */
        _transformDateFormat: function(variant) {

            var format = this.options.dateFormat;

            switch(variant) {
                case 'calendarsPicker':
                    format = format.replace('%Y', 'yyyy')
                                   .replace('%y', 'yy')
                                   .replace('%-m', 'm')
                                   .replace('%m', 'mm')
                                   .replace('%-d', 'd')
                                   .replace('%d', 'dd')
                                   .replace('%B', 'MM')
                                   .replace('%b', 'M');
                    break;
                default:
                    format = format.replace('%Y', 'yy')
                                   .replace('%y', 'y')
                                   .replace('%-m', 'm')
                                   .replace('%m', 'mm')
                                   .replace('%-d', 'd')
                                   .replace('%d', 'dd')
                                   .replace('%B', 'MM')
                                   .replace('%b', 'M');
                    break;
            }
            return format;
        },

        /**
         * Transform the time format (Python strftime) into a timepicker
         * format string
         */
        _transformTimeFormat: function() {

            var format = this.options.timeFormat;

            format = format.replace('%p', 'TT')
                           .replace('%-I', 'h')
                           .replace('%I', 'hh')
                           .replace('%-H', 'H')
                           .replace('%H', 'HH')
                           .replace('%M', 'mm')
                           .replace('%S', 'ss');
            return format;
        },

        /**
         * Replace the focus event on the trigger by a click event
         * in case the trigger element already has the focus
         *
         * @param {jQuery|string} trigger - the trigger element
         */
        _clickFocus: function(trigger) {

            var node = $(trigger);
            if (node.is(':focus')) {
                node.one('click', function(){
                    $(this).focus();
                });
            }
            return node;
        },

        /**
         * Public method to change the minimum selectable date/time of this instance
         *
         * @param {Date} jsDate - the minimum date/time
         */
        setMinDate: function(jsDate) {

            return this._setExtreme('min', jsDate);
        },

        /**
         * Public method to change the maximum selectable date/time of this instance
         *
         * @param {Date} jsDate - the maximum date/time
         */
        setMaxDate: function(jsDate) {

            return this._setExtreme('max', jsDate);
        },

        /**
         * Set minimum or maximum date/time for this instance
         *
         * @param {string} extreme: the extreme ('min' or 'max')
         * @param {Date} jsDate: the JS Date to set
         */
        _setExtreme: function(extreme, jsDate) {

            var el = $(this.element),
                opts = this.options,
                extremeDateTime;

            if (!jsDate) {
                // Reset to original extremeDateTime
                extremeDateTime = this[extreme + 'DateTime'];
            } else {
                // Set jsDate as extremeDateTime
                extremeDateTime = jsDate;
            }

            if (opts.calendar == 'gregorian') {
                if (opts.timepicker) {
                    // Update datetimepicker (for some reason, we must update
                    // both min/maxDate and min/maxDateTime in this case :/)
                    el.datetimepicker('option', extreme + 'Date', extremeDateTime);
                    el.datetimepicker('option', extreme + 'DateTime', extremeDateTime);
                } else {
                    // Update datepicker
                    el.datepicker('option', extreme + 'Date', extremeDateTime);
                }
            } else {
                // Get the dateInput
                var dateInput;
                if (opts.timepicker) {
                    dateInput = this.dateInput;
                } else {
                    dateInput = el;
                }
                // Split extremeDateTime into extremeDate and extremeTime
                var extremeDate,
                    extremeTime,
                    splitExtreme;
                if (extremeDateTime) {
                    var calendar = dateInput.calendarsPicker('option', 'calendar');
                    splitExtreme = this._splitExtreme(calendar, extremeDateTime);
                    extremeDate = splitExtreme.date;
                    extremeTime = splitExtreme.time;
                } else {
                    // Reset to zero
                    extremeDate = null;
                    extremeTime = null;
                }
                // Update timepicker if necessary
                if (opts.timepicker) {
                    this.timeInput.data(extreme + 'Time', jsDate ? extremeTime : null);
                }
                // Update the calendarsPicker
                dateInput.calendarsPicker('option', extreme + 'Date', extremeDate);
            }
        },

        /**
         * Update the minimum/maximum selectable date/times in any
         * setMin/setMax target widgets with the given JS Date.
         *
         * @param {Date} jsDate - the JS Date
         * @param {bool} withTime - use the time from the jsDate (otherwise
         *                          fall back to day start/end)
         */
        _updateExtremes: function(jsDate, withTime) {

            var opts = this.options;

            if (opts.setMin) {
                if (!withTime && jsDate) {
                    jsDate.setHours(0, 0, 0);
                }
                $(opts.setMin).each(function() {
                    if ($(this).calendarWidget('instance')) {
                        $(this).calendarWidget('setMinDate', jsDate);
                    }
                });
            }
            if (opts.setMax) {
                if (!withTime && jsDate) {
                    jsDate.setHours(23, 59, 59);
                }
                $(opts.setMax).each(function() {
                    if ($(this).calendarWidget('instance')) {
                        $(this).calendarWidget('setMaxDate', jsDate);
                    }
                });
            }
        },

        /**
         * Clear
         *
         * @todo: also clear set_min/set_max limits (once implemented)
         */
        clear: function() {

            var el = $(this.element);

            // Clear any hidden inputs
            if (this.dateInput) {
                this.dateInput.val('');
            }
            if (this.timeInput) {
                this.timeInput.val('');
            }
            // Update the real input
            if (this.dateInput && this.timeInput) {
                this._updateInput();
            } else {
                el.val('');
            }

            this._updateExtremes(null);

            // Inform the filter form about the change
            el.closest('.filter-form').trigger('optionChanged');
        },

        /**
         * Bind events to generated elements (after refresh)
         */
        _bindEvents: function() {

            var el = $(this.element),
                ns = this.namespace,
                self = this;

            // Trigger calendarsPicker.show when real input receives focus
            if (this.dateInput || this.timeInput) {
                el.bind('focus' + ns, function() {
                    self.dateInput.calendarsPicker('show');
                });
                el.bind('keypress' + ns, function(event) {
                    self._manualInput(event);
                });
                el.bind('keydown' + ns, function(event) {
                    self._manualInput(event);
                });
                el.bind('keyup' + ns, function(event) {
                    self._manualInput(event);
                });
                // Change-event for date and time inputs
                this.dateInput.bind('change' + ns, function() {
                    self._updateInput();
                });
                this.timeInput.bind('change' + ns, function() {
                    self._updateInput();
                });
            }

            // Clear-button
            this.clearButton.bind('click' + ns, function() {
                self.clear();
            });

            return true;
        },

        /**
         * Unbind events (before refresh)
         */
        _unbindEvents: function() {

            var el = $(this.element),
                ns = this.namespace,
                self = this;

            // Real input
            el.unbind(ns);

            // Hidden inputs
            if (this.dateInput) {
                this.dateInput.unbind(ns);
            }
            if (this.timeInput) {
                this.timeInput.unbind(ns);
            }

            // Clear-button
            if (this.clearButton) {
                this.clearButton.unbind(ns);
            }

            return true;
        }
    });
})(jQuery);