window.optimizelyTemplateTool = {
    initialize: function() {
        var app_config_string = optimizelyTemplateTool.appConfig.get();
        // If app config not there, display configuration element
        if (!app_config_string) {
            $('head').append('<style>#step_configure{display:block;}</style>');
        } else {
            $('head').append('<style>#step_experiment{display:block;}</style>');
            // Transform to Javascript object
            var app_config = JSON.parse(app_config_string);

            var optly = new OptimizelyAPI({
                auth_mode: app_config.api_key ? "api_key" : "oauth",
                api_key: app_config.api_key,
                client_id: 6705913417
            });
        }

        $(document).ready(function() {
            // Fill JSON config if available
            $('#step_configure .configuration').val(app_config_string ? app_config_string : '');
            // CodeMirror textarea
            var editor = CodeMirror.fromTextArea(document.getElementById('configuration'), {
                mode: "text/javascript",
                lineWrapping: true,
                lineNumbers: true,
                tabSize: 2,
                theme: "default"
            });
            // Hook up configuration save button to setter
            $('#step_configure .save').click(function(event) {
                event.preventDefault();
                var configure = optimizelyTemplateTool.appConfig.set(editor.getValue());
                if (configure == true) {
                    location.reload();
                } else if (configure instanceof Error) {
                    alert(configure.message);
                }
            });
            // Enable switching from experiment to configuration
            $('#settings_icon').click(function() {
                $('#step_configure').show();
                $('#step_experiment').hide();
                editor.refresh();
            });

            // If app config available, render fields
            for (var key in app_config.placeholders.experiment) {
                if (app_config.placeholders.experiment.hasOwnProperty(key)) {
                    $('#experiment-level')
                        .append('<li class="lego-form-field__item">\
                            <label class="lego-label" for="' + key + '">' + key + '</label>\
                            <input name="' + key + '" type="text" class="lego-text-input" pattern="' + app_config.placeholders.experiment[key] + '">\
                        </li>');
                }
            }
            for (var key in app_config.placeholders.variation) {
                if (app_config.placeholders.variation.hasOwnProperty(key)) {
                    if (app_config.placeholders.variation[key].source == 'filepicker') {

                        var li_item = $('<li class="lego-form-field__item">\
                            <label class="lego-label" for="' + key + '">' + key + '</label>\
                            <div class="preview"></div>\
                        </li>');
                        var el = $('<input name="' + key + '" type="filepicker" class="lego-button lego-button--brand" value="">')
                            .attr(app_config.placeholders.variation[key].options)
                            .change(function(event) {
                                $(li_item).find('.preview').html('<p><img src="' + event.originalEvent.fpfile.url + '"></p>').prepend('<p>').prepend(el);
                                $(el).attr({
                                    'class': '',
                                    'disabled': 'true'
                                }).addClass('lego-text-input').show();
                            });

                        $(li_item).append(el).appendTo('#variation-level');

                        filepicker.constructWidget(el);

                        $(el).detach();

                    } else {
                        $('#variation-level')
                            .append('<li class="lego-form-field__item">\
                            <label class="lego-label" for="' + key + '">' + key + '</label>\
                            <input name="' + key + '" type="text" class="lego-text-input" pattern="' + app_config.placeholders.variation[key] + '">\
                        </li>');
                    }
                }
            }

            // Add fields for variation-level placeholders to html form

            for (var key in app_config.placeholders.variation) {
                if (app_config.placeholders.variation.hasOwnProperty(key)) {
                    $('.variation-details ul')
                        .append("<li><div class=\"form-group\"><label for=\"" + key + "\">" + key + "</label><br><input name=\"" + key + "\" type=\"text\" placehold=\"" + key + "\" style=\"width:100%\"></div></li>");
                }
            }
        });

        $('#step_experiment form').submit(function(e) {

            optimizelyTemplateTool.spinner('Creating experiment…');

            e.preventDefault();

            // TODO: Clean up spaghetti code

            function createExperimentDefinition() {

                // Create new experiment_definition object containing experiment, original and goals
                var experiment_definition = {
                    "experiment": app_config.experiment,
                    "variations": [
                        app_config.variations[0]
                    ],
                    "goals": app_config.goals,
                    "conditional_code": app_config.conditional_code,
                    "activation_mode": app_config.activation_mode
                };
                // Add variations based on formsets and replace variation-level placeholders with actual values (using JSON.stringify's replacer function)
                $('#variation-level')
                    .each(function(index, element) {
                        var variation = JSON.parse(JSON.stringify(app_config.variations[1], function(key, value) {
                            if (typeof value === "string") {
                                for (var key in app_config.placeholders.variation) {
                                    var fieldvalue = $("#variation-level input[name=\"" + key + "\"]").val() ? $("#variation-level input[name=\"" + key + "\"]").val() : "";
                                    var value = value.replace(new RegExp("{{" + key + "}}", 'g'), fieldvalue.replace(/\\([\s\S])|(")/g,"\\$1$2") );
                                }
                            }
                            return value;
                        }));

                        experiment_definition.variations.push(variation);

                    });

                // Iterate through all strings and fill in experiment-level values for placeholders (using JSON.stringify's replaced function to iterate through all strings)

                experiment_definition = JSON.parse(JSON.stringify(experiment_definition, function(key, value) {
                    if (typeof value === "string") {
                        for (var key in app_config.placeholders.experiment) {
                            var fieldvalue = $("#experiment-level input[name=\"" + key + "\"]").val() ? $("#experiment-level input[name=\"" + key + "\"]").val() : "";
                            var value = value.replace(new RegExp("{{" + key + "}}", 'g'), fieldvalue.replace(/\\([\s\S])|(")/g,"\\$1$2") );
                        }
                        for (var key in app_config.placeholders.variation) {
                            var fieldvalue = $("#variation-level input[name=\"" + key + "\"]").val() ? $("#variation-level input[name=\"" + key + "\"]").val() : "";
                            var value = value.replace(new RegExp("{{" + key + "}}", 'g'), fieldvalue.replace(/\\([\s\S])|(")/g,"\\$1$2") );
                        }
                    }
                    return value;
                }));



                return experiment_definition;

            }

            var experiment_id = null;

            function createExperiment(experiment_definition) {

                optimizelyTemplateTool.spinner('Creating experiment…');
                // Create experiment

                optly.post("projects/" + app_config.project_id + '/experiments', experiment_definition.experiment, function(experiment) {
                    experiment_id = experiment.id;
                    console.log('experiment definition:', experiment_definition);
                    updateVariations(experiment, experiment_definition);
                    addGoals(experiment, experiment_definition);
                });
            }

            function updateVariations(experiment, experiment_definition) {

                optimizelyTemplateTool.spinner('Adding variations…');

                for (var i = 0; i < experiment_definition.variations.length; i++) {

                    if (i < experiment.variation_ids.length) {
                        optly.put('variations/' + experiment.variation_ids[i], experiment_definition.variations[i], function() {});
                    } else {
                        optly.post('experiments/' + experiment.id + '/variations', experiment_definition.variations[i], function() {});
                    }

                }

            }

            function addGoals(experiment, experiment_definition) {
                // TO DO because of BUG-2364, the primary goal is not always set correctly

                optimizelyTemplateTool.spinner('Adding goals…');

                // remove engagement goal
                optly.get("projects/" +app_config.project_id +"/goals", function(goals) {
                    for (var key in goals) {
                      goal = goals[key];
                      var new_experiment_ids = [];
                      if (goal.title == 'Engagement') {
                        for (i = 0; i < goal.experiment_ids.length; i++) {
                            if (goal.experiment_ids[i] != experiment_id) {
                                new_experiment_ids.push(goal.experiment_ids[i]);
                            }
                        }
                        update_experimentids = {
                            "experiment_ids": new_experiment_ids
                        };
                        optly.put("goals/" +goal.id, update_experimentids, function() {});
                      }
                    }
                });

                // primary goal is first defined goal in the list
                var primary_goal_event_name = experiment_definition.goals[0].title;
                var goal_ids = [];
                var primary_goal_id = "";

                for (var i = 0; i < experiment_definition.goals.length; i++) {
                    var new_goal_definition = experiment_definition.goals[i];
                    if (typeof new_goal_definition === "number") {

                        optly.get("goals/" + experiment_definition.goals[i], function(goal) {
                            var index = goal.experiment_ids.indexOf(experiment_definition.goals[i]);
                            goal.experiment_ids.splice(index, 1);

                            goal.experiment_ids.push(experiment_id);
                            update_experimentids = {
                                "experiment_ids": goal.experiment_ids
                            };

                            goal_ids.push(goal.id.toString());

                            optly.put("goals/" + goal.id, update_experimentids, function() {});
                        });

                    } else if (typeof new_goal_definition === "object") {

                        optly.post("projects/" + app_config.project_id + "/goals/", new_goal_definition, function(goal) {

                            goal_ids.push(goal.id.toString());

                            goal.experiment_ids.push(experiment_id);
                            update_experimentids = {
                                "experiment_ids": goal.experiment_ids
                            };

                            optly.put("goals/" + goal.id, update_experimentids, function(goal) {
                                // check if this is the primary goal
                                if (goal.title == primary_goal_event_name) {
                                    primary_goal_id = goal.id;
                                }
                            })
                        });
                    }
                }

                // because of https://optimizely.atlassian.net/browse/BUG-2364 we might need
                // to manually update the list and then set the primary goal
                var waitForExperiment = setInterval(function() {
                    if (optly.outstandingRequests == 0) {
                        clearInterval(waitForExperiment);
                        settings = {
                            "display_goal_order_lst": goal_ids,
                            "primary_goal_id": primary_goal_id
                        };
                        optly.put("experiments/" + experiment_id, settings, function(e) {});
                    }
                }, 300);



            }

            var experiment_definition = createExperimentDefinition();
            createExperiment(experiment_definition);
            e.preventDefault();
            var waitForExperiment = setInterval(function() {
                if (optly.outstandingRequests == 0) {
                    clearInterval(waitForExperiment);
                    if (app_config.redirect_url == "NO_REDIRECT") {
                        optimizelyTemplateTool.spinner();
                    } else if (app_config.redirect_url === undefined) {
                        // just to be backward compatible but ideally no redirect_url would mean no redirect
                        optimizelyTemplateTool.spinner('Successfully Created the Experiment!');
                        window.location.href = "https://optimizely-solutions.github.io/Editorial-Testing-App/#success";
                        location.reload();
                    } else {
                        optimizelyTemplateTool.spinner('Successfully Created.');
                        app_config.redirect_url = app_config.redirect_url.replace("{{Experiment ID}}", experiment_id);
                        //window.location.href = app_config.redirect_url;
                        var win = window.open(app_config.redirect_url, '_blank');
                        win.focus();
                    }
                }
            }, 300);

        });

    },
    appConfig: {
        local_storage_key: 'optimizely_template_config',
        checkConfig: function(config) {
            // Check if empty
            if (config === null || config === '') {
                throw new Error("Configuration missing.");
            };
            // Check if valid JSON
            try {
                var config_obj = JSON.parse(config);
            } catch (e) {
                throw new Error("Configuration isn't valid JSON. Make sure to use a JSON Linter and no trailing commas.");
            }
            // Check if JSON matches schema by looking up a few values
            // TODO: Should create and load a full schema definition
            try {
                if (typeof config_obj.experiment.edit_url == "undefined" ||
                    config_obj.variations.description == "undefined") {
                    throw true;
                }
            } catch (e) {
                throw new Error("Configuration is missing important information. Please check the template definition based on the boilerplate.");
            }

        },
        get: function() {
            // Pull configuration from LocalStorage
            var local_storage_item = localStorage.getItem(this.local_storage_key);
            // Return false if not config not available or broken
            try {
                this.checkConfig(local_storage_item);
            } catch (e) {
                return false;
            }
            return local_storage_item;
        },
        set: function(config) {
            try {
                this.checkConfig(config);
            } catch (e) {
                return e;
            }

            localStorage.setItem(this.local_storage_key, config);

            return true;
        }
    },
    logger: function(e) {
        console.log("ERROR:");
        console.log(e);
    },
    spinner: function(message) {
        if (message != undefined) {
            $('#overlay').show();
            $('#status').text(message || "Please wait…");
        } else {
            $('#overlay').hide();
        }
    }

};

optimizelyTemplateTool.initialize();
