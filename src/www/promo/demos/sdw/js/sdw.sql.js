// General note on design:
//   . the world: prefix designates world-elements that constitute the context for the whole
//     application/simulation, such as homes, addresses etc. (could be virtual or real, doesn't matter)
//   . the simul: prefix designates parts that are dedicated to pure simulation, i.e. pathsql code that simulates
//     the internal behavior of a sensor; nothing above the sensor should be called simul
//   . the control: prefix designates parts of the basic machine programming in pathsql, to control the system;
//     these parts demonstrate how a system receiving its inputs from sensors can be programmed entirely in pathsql
//   . the cep: prefix designates parts that are somewhat external to the core system, by reacting
//     to complex events and triggering actions that don't participate to the core system's behavior,
//     nor directly modify its state
//   . the meta: prefix is for annotations etc.
//   . the inst: prefix is for instantiation parameters (for templates)
//   . the test: prefix is for unit tests/examples
//   . the 'rt/' name prefix (within the scope of any of the above URL prefixes) designates
//     runtime data, i.e. live data that emanates from the running system
//   . while implementing this application, it became increasingly clear that affinity classes
//     also constitute a very nice abstraction for templates/generators, i.e. objects that can generate
//     other objects based on a static+dynamic parametrization (i.e. class properties + properties
//     on the classified pin)
//   Note:
//     The mechanisms that will soon become available for cep may be usable for the control part,
//     similar to how regular expressions are used nowadays to split the logic of web servers,
//     but I will try to preserve this distinction nonetheless, for clarity, and to demonstrate
//     how affinity can play the cep role regardless of whether or not it owns the control aspect.
// Note:
//   My goal is for this file to become as much as possible a pure-PathSQL program.
//   Presently it's not possible, and external services are not yet complete enough to
//   delegate all missing functionality to them, so there's still a minimal interaction
//   with the host language, but I'm aiming at removing it.
// Note:
//   Due to the current limitation constraining path expressions to FROM,
//   a lot of denormalization is used presently in the structure of the sample.
// TODO: proceed with the concept of immutable props in mind...
// TODO: make it easy to substitute a value generator based on user input (e.g. alarm system controlled manually)
// TODO: use the OPTIONS(transient) for simple messages (e.g. new command etc.)
// TODO quick review: all simul: correct?
// TODO quick review: any spurious core classes?


/**
 * Preferred prefixes.
 * Note: I follow a convention similar to modeling.py, for the moment.
 */
SIMULCTX.singleInstall(
// Criterion for single install.
"SELECT * FROM afy:Classes WHERE afy:objectID=.\"http://localhost/afy/preferredPrefixes\"",
// What to install."
"START TRANSACTION;\n\
CREATE CLASS \"http://localhost/afy/preferredPrefixes\" AS SELECT * WHERE EXISTS(\"http://localhost/afy/preferredPrefix/name\") AND EXISTS(\"http://localhost/afy/preferredPrefix/value\") AND EXISTS(\"http://localhost/afy/preferredPrefix/scope\");\n\
INSERT \"http://localhost/afy/preferredPrefix/scope\"='http://sdw2', \"http://localhost/afy/preferredPrefix/name\"='world', \"http://localhost/afy/preferredPrefix/value\"='http://sdw2/world';\n\
INSERT \"http://localhost/afy/preferredPrefix/scope\"='http://sdw2', \"http://localhost/afy/preferredPrefix/name\"='simul', \"http://localhost/afy/preferredPrefix/value\"='http://sdw2/simul';\n\
INSERT \"http://localhost/afy/preferredPrefix/scope\"='http://sdw2', \"http://localhost/afy/preferredPrefix/name\"='control', \"http://localhost/afy/preferredPrefix/value\"='http://sdw2/control';\n\
INSERT \"http://localhost/afy/preferredPrefix/scope\"='http://sdw2', \"http://localhost/afy/preferredPrefix/name\"='cep', \"http://localhost/afy/preferredPrefix/value\"='http://sdw2/cep';\n\
INSERT \"http://localhost/afy/preferredPrefix/scope\"='http://sdw2', \"http://localhost/afy/preferredPrefix/name\"='meta', \"http://localhost/afy/preferredPrefix/value\"='http://sdw2/meta';\n\
INSERT \"http://localhost/afy/preferredPrefix/scope\"='http://sdw2', \"http://localhost/afy/preferredPrefix/name\"='inst', \"http://localhost/afy/preferredPrefix/value\"='http://sdw2/inst';\n\
INSERT \"http://localhost/afy/preferredPrefix/scope\"='http://sdw2', \"http://localhost/afy/preferredPrefix/name\"='test', \"http://localhost/afy/preferredPrefix/value\"='http://sdw2/test';\n\
COMMIT;"
);


/**
 * Core classes.
 */
SIMULCTX.singleInstall(
// Criterion for single install.
"SELECT * FROM afy:Classes WHERE afy:objectID=.world:locations",
// What to install."
"START TRANSACTION;\n\
-- Declare core classes.\n\
CREATE CLASS world:locations AS SELECT * WHERE EXISTS(world:latitude) AND EXISTS(world:longitude);\n\
CREATE CLASS world:homes AS SELECT * FROM world:locations WHERE EXISTS(world:appliances);\n\
CREATE CLASS world:appliances AS SELECT * WHERE EXISTS(control:control_energy);\n\
CREATE CLASS control:sensors AS SELECT * WHERE control:\"sensor/name\" IN :0;\n\
CREATE CLASS control:\"rt/signalable\" AS SELECT * WHERE EXISTS(control:\"rt/time/signal\");\n\
CREATE CLASS control:\"rt/physical/samples\" AS SELECT * WHERE EXISTS(control:\"rt/time/step\") AND EXISTS(control:\"rt/sensor\");\n\
CREATE CLASS simul:\"value/generators\" AS SELECT * WHERE CONTAINS(afy:objectID, 'simul/value/gen/');\n\
CREATE TIMER control:\"rt/source/timer\" INTERVAL '00:00:01' AS UPDATE control:\"rt/signalable\" SET control:\"rt/time/signal\"=EXTRACT(SECOND FROM CURRENT_TIMESTAMP), control:\"rt/time\"=CURRENT_TIMESTAMP;\n\
COMMIT;"
);


/**
 * Basic, reusable value generators (for simulated sensors).
 * They actually act like filters (i.e. the classified sample pin is modified to append control:"rt/value").
 * Note:
 *   The $(...) syntax is limited (no nested SELECT, limited access to collection values, etc.).
 *   Also when I experimented with it, I was not aware of the ability to compose functions
 *   (I erroneously thought that $(...) could only be evaluated via an explicit SELECT).
 *   ${...} is less limited, but at the moment can't be invoked directly.
 *   Also, it's not possible to gather all generators by query and produce all
 *   samples in a single statement (e.g. INSERT ... FROM ...).
 *   For all those reasons, I chose what appeared to me as the most generic
 *   solution for generating samples: to attach the sample values via a class with trigger
 *   (i.e. blank samples, identified with the desired generator, are first produced,
 *   then detected here, and the desired value is computed and attached,
 *   mostly as a function of control:"rt/time/step").
 *   All in all this is not a critical decision, because in a real-life scenario these
 *   values would not be simulated (or could be simulated by an external service).
 *   It's also compatible with Mark's upcoming design using immutable properties.
 */
SIMULCTX.singleInstall(
// Criterion for single install.
"SELECT * FROM simul:\"value/generators\"",
// What to install."
"START TRANSACTION;\n\
-- Declare generators.\n\
CREATE CLASS simul:\"value/gen/sinus\" AS SELECT * WHERE simul:\"rt/value/gen/id\"=@class.afy:objectID SET\n\
  meta:description='A general-purpose value generator for sinusoidal curves',\n\
  afy:onEnter=${UPDATE @self SET control:\"rt/value\"=MAX(simul:\"rt/gen/min\", MIN(simul:\"rt/gen/max\", (simul:\"rt/gen/min\" + ((0.5 + SIN(control:\"rt/time/step\")) * (simul:\"rt/gen/max\" - simul:\"rt/gen/min\"))) + simul:\"rt/gen/jitter\"))};\n\
CREATE CLASS simul:\"value/gen/linear_up\" AS SELECT * WHERE simul:\"rt/value/gen/id\"=@class.afy:objectID SET\n\
  meta:description='A general-purpose value generator for linear upward curves',\n\
  afy:onEnter=${UPDATE @self SET control:\"rt/value\"=MAX(simul:\"rt/gen/min\", MIN(simul:\"rt/gen/max\", (simul:\"rt/gen/min\" + (control:\"rt/time/step\" * simul:\"rt/gen/spread\") * (simul:\"rt/gen/max\" - simul:\"rt/gen/min\")) + simul:\"rt/gen/jitter\"))};\n\
CREATE CLASS simul:\"value/gen/linear_down\" AS SELECT * WHERE simul:\"rt/value/gen/id\"=@class.afy:objectID SET\n\
  meta:description='A general-purpose value generator for linear downward curves',\n\
  afy:onEnter=${UPDATE @self SET control:\"rt/value\"=MAX(simul:\"rt/gen/min\", MIN(simul:\"rt/gen/max\", (simul:\"rt/gen/max\" - (control:\"rt/time/step\" * simul:\"rt/gen/spread\") * (simul:\"rt/gen/max\" - simul:\"rt/gen/min\")) + simul:\"rt/gen/jitter\"))};\n\
-- Declare unit tests (optional).\n\
CREATE CLASS test:\"value/gen\" AS SELECT * WHERE EXISTS(test:\"new/value/gen\") SET \n\
  meta:description='A unit test to check that value generators work, and to show how they are used',\n\
  afy:onEnter=\n\
    ${INSERT \n\
      simul:\"rt/value/gen/id\"=.simul:\"value/gen/sinus\", control:\"rt/time/step\"=10,\n\
      simul:\"rt/gen/spread\"=1, simul:\"rt/gen/min\"=0, simul:\"rt/gen/max\"=100, simul:\"rt/gen/jitter\"=0};\n\
COMMIT;"
);


/**
 * Generic sensor templates.
 * Note:
 *   At the moment, conditions are declared as classes, with the intent that the rules
 *   derived from them will effectively use the inheritance mechanism (to reuse them and
 *   possibly refine them with additional conditions).  At the present moment,
 *   this appears to be the only mechanism available to describe conditions independently
 *   from the final rules, without a "divine intervention" of the host language.
 */
SIMULCTX.singleInstall(
// Criterion for single install.
"SELECT * FROM afy:Classes WHERE afy:objectID=.simul:\"template/sensor/on.off.572ef13c\"",
// What to install."
"START TRANSACTION;\n\
INSERT @:1\n\
  meta:description='On/Off Simulated Sensor Template (572ef13c)',\n\
  afy:objectID=.simul:\"template/sensor/on.off.572ef13c\",\n\
  afy:predicate=${SELECT * WHERE EXISTS(simul:\"new/sensor/572ef13c\")},\n\
  control:\"template/sensor/step/handler\"=\n\
    (CREATE CLASS control:\"template/sensor/step/handler/on.off.572ef13c\" AS SELECT * FROM control:\"rt/signalable\" WHERE control:\"sensor/model\"=.simul:\"template/sensor/on.off.572ef13c\" SET\n\
      control:\"template/sensor\"=@:1,\n\
      afy:onUpdate=${INSERT \n\
        simul:\"rt/gen/spread\"=(SELECT simul:\"template/gen/spread\" FROM @class.control:\"template/sensor\"),\n\
        simul:\"rt/gen/min\"=(SELECT simul:\"template/gen/min\" FROM @class.control:\"template/sensor\"),\n\
        simul:\"rt/gen/max\"=(SELECT simul:\"template/gen/max\" FROM @class.control:\"template/sensor\"),\n\
        simul:\"rt/gen/jitter\"=(SELECT simul:\"template/gen/jitter\" FROM @class.control:\"template/sensor\") * EXTRACT(SECOND FROM CURRENT_TIMESTAMP),\n\
        simul:\"rt/value/gen/id\"=.simul:\"value/gen/sinus\",\n\
        control:\"rt/sensor\"=(SELECT control:sensor FROM @self),\n\
        control:\"rt/sensor/model\"=(SELECT control:\"sensor/model\" FROM @self.control:sensor),\n\
        control:\"rt/time/step\"=(SELECT control:\"rt/time/signal\" FROM @self), control:\"rt/time\"=CURRENT_TIMESTAMP}),\n\
  control:\"template/sensor/conditions\"={\n\
    (INSERT \n\
      meta:description='Condition: turned off a 572ef13c sensor',\n\
      afy:objectID=.control:\"template/condition/572ef13c/off\",\n\
      afy:predicate=${SELECT * WHERE (@ IS A control:\"rt/physical/samples\" AND control:\"rt/sensor/model\"=@:1.afy:objectID AND control:\"rt/value\" < 0.5)}),\n\
    (INSERT \n\
      meta:description='Condition: turned on a 572ef13c sensor',\n\
      afy:objectID=.control:\"template/condition/572ef13c/on\",\n\
      afy:predicate=${SELECT * WHERE (@ IS A control:\"rt/physical/samples\" AND control:\"rt/sensor/model\"=@:1.afy:objectID AND control:\"rt/value\" >= 0.5)}),\n\
    (INSERT \n\
      meta:description='Condition (optional): confirmed that a 572ef13c sensor was off',\n\
      afy:objectID=.control:\"template/condition/572ef13c/off.confirmed\",\n\
      afy:predicate=${SELECT * WHERE (@ IS A world:appliances AND NOT EXISTS(control:\"rt/emergency/time\") AND (control:\"rt/warning/time\"[:LAST] - control:\"rt/warning/time\"[:FIRST] >= INTERVAL '00:00:05'))})},\n\
  simul:\"template/sensor/generator\"=(SELECT afy:pinID FROM afy:Classes WHERE afy:objectID=.simul:\"value/gen/sinus\"),\n\
  simul:\"template/gen/type\"='boolean', simul:\"template/gen/jitter\"=0,\n\
  simul:\"template/gen/min\"=0, simul:\"template/gen/max\"=100,\n\
  simul:\"template/gen/spread\"=1.5,\n\
  afy:onEnter=\n\
    ${INSERT @:20\n\
      meta:description='On/Off Simulated Sensor Instance (572ef13c): ', -- || (SELECT inst:name FROM @self),\n\
      control:\"sensor/model\"=(SELECT afy:objectID FROM @class),\n\
      control:\"sensor/name\"=(SELECT inst:name FROM @self),\n\
      control:appliance=(SELECT inst:appliance FROM @self),\n\
      simul:\"sensor/signalable\"=\n\
        (INSERT @:30\n\
          meta:description='Timer generating samples for sensor ', -- || (SELECT afy:pinID FROM @:20),\n\
          control:\"rt/time/signal\"=0,\n\
          control:\"sensor/model\"=(SELECT afy:objectID FROM @class), -- @:20.control:\"sensor/model\" \n\
          control:sensor=@:20)};\n\
-- Declare unit tests (optional).\n\
CREATE CLASS test:\"template/sensor/on.off.572ef13c\" AS SELECT * WHERE EXISTS(test:\"new/572ef13c\") SET \n\
  meta:description='A unit test to check that sensor creation works, and to show how it is used',\n\
  afy:onEnter=${INSERT OPTIONS(transient) simul:\"new/sensor/572ef13c\"=1, inst:name='mysensor-1234567890', inst:appliance=(INSERT meta:description='Bogus appliance')};\n\
COMMIT;"
);


/**
 * Appliances: smart light template.
 */
SIMULCTX.singleInstall(
// Criterion for single install.
"SELECT * FROM afy:Classes WHERE afy:objectID=.control:\"template/appliance/smartlight.53f5265f\"",
// What to install."
"START TRANSACTION;\n\
-- Declare the template (from which specific instances can be created).\n\
INSERT @:1\n\
  meta:description='Smart Light Template (53f5265f)',\n\
  afy:objectID=.control:\"template/appliance/smartlight.53f5265f\",\n\
  afy:predicate=${SELECT * WHERE EXISTS(control:\"new/appliance/53f5265f\")},\n\
  control:\"template/appliance/actions\"={\n\
    (INSERT @:10\n\
      meta:description='Action template: warn no presence',\n\
      afy:objectID=.control:\"template/action/53f5265f/warn.no.presence\",\n\
      afy:predicate=${SELECT * WHERE EXISTS(control:\"new/action/53f5265f/warn.no.presence\")},\n\
      afy:onEnter={\n\
        ${UPDATE @self ADD control:home_locked=(SELECT control:\"appliance/state\" FROM @self.inst:home.control:appliances WHERE control:\"appliance/model\"=@:1.afy:objectID)},\n\
        ${UPDATE @self.control:appliance ADD control:\"rt/warning/time\"=CURRENT_TIMESTAMP WHERE NOT (1 = control:home_locked[:LAST])},\n\
        ${INSERT control:_debug=CURRENT_TIMESTAMP, control:_locked=@self.control:home_locked[:LAST], control:_state=(SELECT control:\"appliance/state\" FROM @self.inst:appliance), control:_target_appliance=@self.inst:appliance, control:_this=@self, control:_class=@class},\n\
        ${UPDATE @self DELETE control:home_locked}}),\n\
    (INSERT @:11\n\
      meta:description='Action template: reset no presence',\n\
      afy:objectID=.control:\"template/action/53f5265f/reset.no.presence\",\n\
      afy:predicate=${SELECT * WHERE EXISTS(control:\"new/action/53f5265f/reset.no.presence\")},\n\
      afy:onEnter={\n\
        ${UPDATE @self ADD control:home_locked=(SELECT control:\"appliance/state\" FROM @self.inst:home.control:appliances WHERE control:\"appliance/model\"=@:1.afy:objectID)},\n\
        ${UPDATE @self.control:appliance SET control:\"appliance/state\"=1 WHERE NOT (1 = @self.control:home_locked[:LAST])},\n\
        ${INSERT control:_debug=CURRENT_TIMESTAMP, control:_locked=@self.control:home_locked[:LAST], control:_state=(SELECT control:\"appliance/state\" FROM @self.inst:appliance), control:_target_appliance=@self.inst:appliance, control:_this=@self, control:_class=@class},\n\
        ${UPDATE @self.control:appliance DELETE control:\"rt/warning/time\" WHERE EXISTS(control:\"rt/warning/time\")},\n\
        ${UPDATE @self.control:appliance DELETE control:\"rt/emergency/time\" WHERE EXISTS(control:\"rt/emergency/time\")},\n\
        ${UPDATE @class DELETE control:home_locked}}),\n\
    (INSERT @:12\n\
      meta:description='Action template: close the light on absence',\n\
      afy:objectID=.control:\"template/action/53f5265f/close.on.absence\",\n\
      afy:predicate=${SELECT * WHERE EXISTS(control:\"new/action/53f5265f/close.on.absence\")},\n\
      afy:onEnter={\n\
        ${UPDATE @self.control:appliance SET control:\"appliance/state\"=0},\n\
        ${UPDATE @self.control:appliance ADD control:\"rt/emergency/log\"=CURRENT_TIMESTAMP},\n\
        ${UPDATE @self.control:appliance SET control:\"rt/emergency/time\"=CURRENT_TIMESTAMP, control:\"rt/warning/time\"={CURRENT_TIMESTAMP}},\n\
        ${INSERT control:_debug=CURRENT_TIMESTAMP, control:_state=(SELECT control:\"appliance/state\" FROM @self.control:appliance), control:_target_appliance=@self.control:appliance, control:_this=@self, control:_class=@class}}),\n\
    (INSERT @:13\n\
      meta:description='Action template: request to close the light on home locked',\n\
      afy:objectID=.control:\"template/action/53f5265f/request.close.on.hlocked\",\n\
      afy:predicate=${SELECT * WHERE EXISTS(control:\"new/action/53f5265f/request.close.on.hlocked\")},\n\
      afy:onEnter={\n\
        ${INSERT control:_at=CURRENT_TIMESTAMP, control:close_request=@self.control:\"appliance/state\"}}), -- control:smart_light=@self.control:appliance???(SELECT m.afy:pinID FROM sdw:homes_bug343 AS h JOIN sdw:machines AS m ON (m.afy:pinID=h.sdw:machines) WHERE (m.sdw:\"machine/model\"='GE-SL-53f5265f' AND @self.afy:pinID=h.sdw:machines))}}),\n\
    (INSERT @:14\n\
      meta:description='Action template: close the light on home locked',\n\
      afy:objectID=.control:\"template/action/53f5265f/close.on.hlocked\",\n\
      afy:predicate=${SELECT * WHERE EXISTS(control:\"new/action/53f5265f/close.on.hlocked\")},\n\
      afy:onEnter={\n\
        ${UPDATE @self.control:smart_light SET control:\"appliance/state\"=0},\n\
        ${INSERT control:_debug=CURRENT_TIMESTAMP, control:_target_appliance=@self.control:smart_light, control:_this=@self, control:_class=@class}})},\n\
  control:\"template/appliance/rules\"={\n\
    (INSERT @:20\n\
      meta:description='Rule template: ...',\n\
      afy:objectID=.control:\"template/rule/53f5265f/close.on.hlocked\",\n\
      afy:predicate=${SELECT * WHERE (@ IS A control:\"template/condition/572ef13c/off\")},\n\
      afy:onEnter=${INSERT OPTIONS(transient) control:\"new/action/53f5265f/warn.no.presence\"=1})},\n\
  afy:onEnter=\n\
    ${INSERT @:30\n\
      meta:description='Smart Light Instance (53f5265f): ' || @self.inst:name,\n\
      control:\"home\"=@self.inst:home,\n\
      control:\"appliance/model\"=@class.afy:objectID,\n\
      control:\"appliance/name\"=@self.inst:name,\n\
      control:\"appliance/state\"=0,\n\
      control:\"tmp/create/sensor\"=(INSERT OPTIONS(transient) simul:\"new/sensor/572ef13c\"=1, inst:name='sensor for ' || @self.inst:name, inst:appliance=@:30)};\n\
-- Declare unit tests (optional).\n\
CREATE CLASS test:\"template/appliance/smartlight.GE-53f5265f\" AS SELECT * WHERE EXISTS(test:\"new/53f5265f\") SET \n\
  meta:description='A unit test to check that smart light creation works, and to show how it is used',\n\
  afy:onEnter=${INSERT OPTIONS(transient) control:\"new/appliance/53f5265f\"=1, inst:name='mylight-1234567890', inst:home=(INSERT @:10 meta:description='Bogus home', control:appliances={(INSERT meta:description='Bogus appliance')})};\n\
COMMIT;"
);


/**
 * Appliances: alarm system template.
 */
SIMULCTX.singleInstall(
// Criterion for single install.
"SELECT * FROM afy:Classes WHERE afy:objectID=.control:\"template/appliance/alarmsystem.6932a515\"",
// What to install."
"START TRANSACTION;\n\
-- Declare the template (from which specific instances can be created).\n\
INSERT @:1\n\
  meta:description='Alarm System Template',\n\
  afy:objectID=.control:\"template/appliance/alarmsystem.6932a515\",\n\
  afy:predicate=${SELECT * WHERE EXISTS(control:\"new/appliance/6932a515\")},\n\
  afy:onEnter=\n\
    ${INSERT @:10\n\
      meta:description='Alarm System Instance',\n\
      control:\"home\"=@self.inst:home,\n\
      control:\"appliance/model\"=@class.afy:objectID,\n\
      control:\"appliance/name\"=@self.inst:name,\n\
      control:\"appliance/state\"=0};\n\
COMMIT;"
);


/**
 * Home instances.
 */
SIMULCTX.singleInstall(
// Criterion for single install.
"SELECT * FROM world:locations",
// What to install."
"START TRANSACTION;\n\
-- Declare some addresses.\n\
INSERT world:address='907 Cottrell Way, Stanford, CA 94305, USA', world:latitude=37.4098189, world:longitude=-122.15783929999998, control:\"consumption/aggregated\"=0.7368609257973731;\
INSERT world:address='963 Cottrell Way, Stanford, CA 94305, USA', world:latitude=37.410236, world:longitude=-122.15874780000001, control:\"consumption/aggregated\"=0.5464963882695884;\
INSERT world:address='875 Lathrop Dr, Stanford, CA 94305, USA', world:latitude=37.4153104, world:longitude=-122.16283490000001, control:\"consumption/aggregated\"=0.7349825843703002;\
INSERT world:address='877 Lathrop Dr, Stanford, CA 94305, USA', world:latitude=37.415246, world:longitude=-122.16251899999997, control:\"consumption/aggregated\"=0.4176365772727877;\
INSERT world:address='879 Lathrop Dr, Stanford, CA 94305, USA', world:latitude=37.4151498, world:longitude=-122.16283069999997, control:\"consumption/aggregated\"=0.8910724446177483;\
INSERT world:address='881 Lathrop Dr, Stanford, CA 94305, USA', world:latitude=37.4150526, world:longitude=-122.16282050000001, control:\"consumption/aggregated\"=0.11017747782170773;\
INSERT world:address='842 Mayfield Ave, Stanford, CA 94305, USA', world:latitude=37.4136463, world:longitude=-122.1614553, control:\"consumption/aggregated\"=0.32035585935227573;\
INSERT world:address='886 Mayfield Ave, Stanford, CA 94305, USA', world:latitude=37.4143474, world:longitude=-122.16237209999997, control:\"consumption/aggregated\"=0.8231764894444495;\
INSERT world:address='888 Mayfield Ave, Stanford, CA 94305, USA', world:latitude=37.4143793, world:longitude=-122.1624324, control:\"consumption/aggregated\"=0.8006169029977173;\
INSERT world:address='890 Mayfield Ave, Stanford, CA 94305, USA', world:latitude=37.4144112, world:longitude=-122.1624928, control:\"consumption/aggregated\"=0.3412505332380533;\
INSERT world:address='894 Mayfield Ave, Stanford, CA 94305, USA', world:latitude=37.4144499, world:longitude=-122.1626283, control:\"consumption/aggregated\"=0.032628135522827506;\
INSERT world:address='1014 Vernier Pl, Stanford, CA 94305, USA', world:latitude=37.4093373, world:longitude=-122.1569389, control:\"consumption/aggregated\"=0.24295871355570853;\
INSERT world:address='1024 Vernier Pl, Stanford, CA 94305, USA', world:latitude=37.4091381, world:longitude=-122.15701960000001, control:\"consumption/aggregated\"=0.653208187315613;\
INSERT world:address='903 Ilima Way, Palo Alto, CA 94306, USA', world:latitude=37.40970859999999, world:longitude=-122.13668940000002, control:\"consumption/aggregated\"=0.22286732820793986;\
INSERT world:address='905 Ilima Way, Palo Alto, CA 94306, USA', world:latitude=37.409365, world:longitude=-122.13656000000003, control:\"consumption/aggregated\"=0.08071345533244312;\
INSERT world:address='919 Ilima Way, Palo Alto, CA 94306, USA', world:latitude=37.4092703, world:longitude=-122.1369709, control:\"consumption/aggregated\"=0.6621138257905841;\
INSERT world:address='927 Ilima Way, Palo Alto, CA 94306, USA', world:latitude=37.4091836, world:longitude=-122.13704589999998, control:\"consumption/aggregated\"=0.5670040035620332;\
INSERT world:address='933 Ilima Way, Palo Alto, CA 94306, USA', world:latitude=37.4091186, world:longitude=-122.13710220000002, control:\"consumption/aggregated\"=0.8461377001367509;\
INSERT world:address='3793 Laguna Ave, Palo Alto, CA 94306, USA', world:latitude=37.4099829, world:longitude=-122.13661960000002, control:\"consumption/aggregated\"=0.913541654124856;\
INSERT world:address='3879 Laguna Ave, Palo Alto, CA 94306, USA', world:latitude=37.4091889, world:longitude=-122.13516770000001, control:\"consumption/aggregated\"=0.7102922759950161;\
INSERT world:address='3908 Laguna Ave, Palo Alto, CA 94306, USA', world:latitude=37.4090511, world:longitude=-122.13491049999999, control:\"consumption/aggregated\"=0.9073657237458974;\
INSERT world:address='883 La Para Ave, Palo Alto, CA 94306, USA', world:latitude=37.4096566, world:longitude=-122.1346107, control:\"consumption/aggregated\"=0.7363779318984598;\
INSERT world:address='887 La Para Ave, Palo Alto, CA 94306, USA', world:latitude=37.4095851, world:longitude=-122.13466970000002, control:\"consumption/aggregated\"=0.5186119566205889;\
INSERT world:address='889 La Para Ave, Palo Alto, CA 94306, USA', world:latitude=37.409403, world:longitude=-122.13441799999998, control:\"consumption/aggregated\"=0.5559402133803815;\
INSERT world:address='891 La Para Ave, Palo Alto, CA 94306, USA', world:latitude=37.409289, world:longitude=-122.13459499999999, control:\"consumption/aggregated\"=0.7911186176352203;\
INSERT world:address='913 Paradise Way, Palo Alto, CA 94306, USA', world:latitude=37.4090824, world:longitude=-122.1357231, control:\"consumption/aggregated\"=0.7548638677690178;\
INSERT world:address='921 Paradise Way, Palo Alto, CA 94306, USA', world:latitude=37.4090099, world:longitude=-122.13578369999999, control:\"consumption/aggregated\"=0.5807517794892192;\
INSERT world:address='929 Paradise Way, Palo Alto, CA 94306, USA', world:latitude=37.40867, world:longitude=-122.13572599999998, control:\"consumption/aggregated\"=0.15452508232556283;\
INSERT world:address='935 Paradise Way, Palo Alto, CA 94306, USA', world:latitude=37.4086998, world:longitude=-122.1360436, control:\"consumption/aggregated\"=0.4262129017151892;\
INSERT world:address='870 San Jude Ave, Palo Alto, CA 94306, USA', world:latitude=37.4103997, world:longitude=-122.13512700000001, control:\"consumption/aggregated\"=0.5890529088210315;\
INSERT world:address='872 San Jude Ave, Palo Alto, CA 94306, USA', world:latitude=37.4103537, world:longitude=-122.1351646, control:\"consumption/aggregated\"=0.8407084119971842;\
INSERT world:address='876 San Jude Ave, Palo Alto, CA 94306, USA', world:latitude=37.4102488, world:longitude=-122.1352503, control:\"consumption/aggregated\"=0.10560294869355857;\
INSERT world:address='880 San Jude Ave, Palo Alto, CA 94306, USA', world:latitude=37.410232, world:longitude=-122.13554199999999, control:\"consumption/aggregated\"=0.061285387026146054;\
INSERT world:address='882 San Jude Ave, Palo Alto, CA 94306, USA', world:latitude=37.4100493, world:longitude=-122.13541320000002, control:\"consumption/aggregated\"=0.49390284926630557;\
INSERT world:address='884 San Jude Ave, Palo Alto, CA 94306, USA', world:latitude=37.410069, world:longitude=-122.13567699999999, control:\"consumption/aggregated\"=0.8936968832276762;\
INSERT world:address='858 Timlott Ln, Palo Alto, CA 94306, USA', world:latitude=37.4112236, world:longitude=-122.13428210000001, control:\"consumption/aggregated\"=0.17875812482088804;\
INSERT world:address='872 Timlott Ln, Palo Alto, CA 94306, USA', world:latitude=37.4111485, world:longitude=-122.13433929999997, control:\"consumption/aggregated\"=0.9611017070710659;\
INSERT world:address='882 Timlott Ln, Palo Alto, CA 94306, USA', world:latitude=37.4110948, world:longitude=-122.13438009999999, control:\"consumption/aggregated\"=0.6402961930725724;\
INSERT world:address='3722 Center Ave, Richmond, CA 94804, USA', world:latitude=37.9301794, world:longitude=-122.33417959999997, control:\"consumption/aggregated\"=0.3975370086263865;\
INSERT world:address='3726 Center Ave, Richmond, CA 94804, USA', world:latitude=37.9301802, world:longitude=-122.33406330000003, control:\"consumption/aggregated\"=0.35100237117148936;\
INSERT world:address='3728 Center Ave, Richmond, CA 94804, USA', world:latitude=37.9301807, world:longitude=-122.33399600000001, control:\"consumption/aggregated\"=0.2665401285048574;\
INSERT world:address='3734 Center Ave, Richmond, CA 94804, USA', world:latitude=37.9301818, world:longitude=-122.33384239999998, control:\"consumption/aggregated\"=0.3706582027953118;\
INSERT world:address='3737 Florida Ave, Richmond, CA 94804, USA', world:latitude=37.9296719, world:longitude=-122.33380299999999, control:\"consumption/aggregated\"=0.7562311510555446;\
INSERT world:address='3795 Florida Ave, Richmond, CA 94804, USA', world:latitude=37.929465, world:longitude=-122.33369440000001, control:\"consumption/aggregated\"=0.11277122283354402;\
INSERT world:address='3807 Florida Ave, Richmond, CA 94804, USA', world:latitude=37.9296719, world:longitude=-122.33356200000003, control:\"consumption/aggregated\"=0.14165514381602407;\
INSERT world:address='3811 Florida Ave, Richmond, CA 94804, USA', world:latitude=37.929465, world:longitude=-122.33348839999996, control:\"consumption/aggregated\"=0.6240981058217585;\
INSERT world:address='3817 Florida Ave, Richmond, CA 94804, USA', world:latitude=37.929674, world:longitude=-122.333326, control:\"consumption/aggregated\"=0.8587706675752997;\
INSERT world:address='3833 Florida Ave, Richmond, CA 94804, USA', world:latitude=37.9294649, world:longitude=-122.33324770000002, control:\"consumption/aggregated\"=0.022329763043671846;\
INSERT world:address='3727 Ohio Ave, Richmond, CA 94804, USA', world:latitude=37.9311099, world:longitude=-122.33398499999998, control:\"consumption/aggregated\"=0.7659231522120535;\
INSERT world:address='3733 Ohio Ave, Richmond, CA 94804, USA', world:latitude=37.9308952, world:longitude=-122.3338832, control:\"consumption/aggregated\"=0.12115649599581957;\
INSERT world:address='3753 Ohio Ave, Richmond, CA 94804, USA', world:latitude=37.9308961, world:longitude=-122.33377230000002, control:\"consumption/aggregated\"=0.40331952134147286;\
INSERT world:address='3795 Ohio Ave, Richmond, CA 94804, USA', world:latitude=37.9308969, world:longitude=-122.3336625, control:\"consumption/aggregated\"=0.8528837249614298;\
INSERT world:address='3807 Ohio Ave, Richmond, CA 94804, USA', world:latitude=37.9308978, world:longitude=-122.3335558, control:\"consumption/aggregated\"=0.15434443368576467;\
INSERT world:address='3817 Ohio Ave, Richmond, CA 94804, USA', world:latitude=37.931111, world:longitude=-122.33329000000003, control:\"consumption/aggregated\"=0.3745965650305152;\
INSERT world:address='3728 Waller Ave, Richmond, CA 94804, USA', world:latitude=37.9287484, world:longitude=-122.33395569999999, control:\"consumption/aggregated\"=0.2313200426287949;\
INSERT world:address='3734 Waller Ave, Richmond, CA 94804, USA', world:latitude=37.9287493, world:longitude=-122.33382180000001, control:\"consumption/aggregated\"=0.4361504956614226;\
INSERT world:address='3764 Waller Ave, Richmond, CA 94804, USA', world:latitude=37.9287501, world:longitude=-122.3336999, control:\"consumption/aggregated\"=0.8628952270373702;\
INSERT world:address='3798 Waller Ave, Richmond, CA 94804, USA', world:latitude=37.9287505, world:longitude=-122.3336314, control:\"consumption/aggregated\"=0.2238994836807251;\
COMMIT;"
);

/*
CREATE CLASS declarator AS SELECT * WHERE EXISTS(cname) AND 0=(SELECT COUNT(*) FROM afy:Classes WHERE afy:classID=cname)
  SET afy:onEnter=${INSERT afy:URI=@self.cname, afy:predicate=@self.cpredicate};
  SET afy:onEnter=${invoke @self.cdecl};
*/

/*
notes on an idealized syntax:
. core classes:
    - ok as is
. generators:
    - ~ok as is (i.e. a filtering class)
    - or some property with ${...}, with some properties on a 'self' pin, and a way to invoke
      (ideally, no need to clutter the pattern matching engine for this)
    - it's essentially f(t, <params>)
    - since essentially for simulation, form/impl may be considered less critical
. sensors:
    - notion of a template (create similar instances from a template)
        . may have internal state to declare and manage
        . each sensor instance should be identified uniquely
    - notion of a periodic capture/generation (timer / INSERT FOR EACH / ?)
        . notion that each sample refers to the specific sensor instance, identified uniquely
          (which in turn allows to retrieve the machine, home etc.)
    - notion of conditions related to those readings and state
        . no boolean $(...) at the moment, but possible composition by declaring
          conditions as classes, with IS A c1 & c2 & c3...
        . conditions seem to be statically bound to sensors, i.e.
          they expect the same symbols (attached on the samples) that the sensor's timer produces,
          but otherwise they are autonomous
    [- possible notion of actions and rules at this level]
. machines/appliances:
    - notion of a template
    - notion of actions related to the state of this machine (and possibly involving other machines, or centralized logic [e.g. energy grid])
        . at the moment I'm using a class to define actions, which allows to invoke these actions from the rules
    - instantiation of the sensors (and their timers)
    - instantiation of the rules (as sensor:conditions -> machine:actions)
        . IS A c1 & c2 & c3... for the composition of conditions (and for data scoping)
        . triggering action classes for the actions

current problems/limitations:
  . no way to do INSERT FOR EACH or instantiate timers from within a class
      seems critical: without either of these, I don't know how to instantiate multiple sensors
      from a template, in pure pathsql
      -> Mark: 1 timer, doing UPDATE @somebaseclass SET sometriggeringvalue
         -> then those classes can do their stuff in their onUpdate
         -> probably need to INSERT... (2 classes for 1 thing)
      -> Mark: event/message for everything; disc on perf and potential new mechanism
         "reuse + event-driven"
  . bug 356 (crash)
      -> Mark: related to nested select and releasing pages...
  . bug 355 (mutliple timers)
  . path expressions to be able to walk a single pointer (to the generating sensor) from the sample
    (e.g. for conditions on the state of the owning machine, or other machines in the owning home)
  ---
  . bug 354
      @:x.prop may be required in some scenarios of triggers creating timers/classes,
      to be able to point to the desired properties; so far I have managed to work around this though
  . bug 353
    - no boolean $(...)
        not critical, but would be very nice to enhance composability
    - no $(...) in predicate
        could be meaningful with immutable $(...) property;
        interesting for code factorisation
    - no way to invoke ${...} (with a pin/self param)
        not critical, but would allow to avoid creating classes for that purpose (avoid cluttering the
        pattern recognition engine where it's not needed)
    - no way to eval a pathsql string
        combined with an immutable prop, is this the INLINE? 
        would be very convenient as a last-resort composition method
  . CREATE CLASS vs singletons etc.
*/

/*
  TODO next:
  . get rid of instantiation issues (e.g. use my old 'step' trick if necessary)
  . test a full machine; report any additional issue
  . add 2-3 machines (from old SDW)
  . add at least one producer
  . add a notion of consumption/production
  . play with comm/other to have logic integrating these states
  . play with UI (+ better spread locations etc.)
  . define some CEP conditions in that context; maybe implement with what's there
  . work on a generic visual builder UI
*/
