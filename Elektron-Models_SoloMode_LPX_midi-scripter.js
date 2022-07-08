/*******************************************************NOPS©**********************************************************/
/**********************************************************************************************************************/
/*			                                                                                                       	
/*  THIS SCRIPTER MODULE ALLOWS TO USE THE MUTE FUNCTION OF MODEL:SAMPLES & MODEL:CYCLES AS A SOLO FUNCTION        	
/*			- TWO MODES ARE AVAILABLE :	                                                                          	
/*										 - STACKED : multiple tracks can be SOLOed at the same time.		
/*   A track stay SOLOed until you press the resp. track again. The module keep memory of the previously SOLOed    	
/*  tracks, so after un-SOLOing a SOLOed track, all previously SOLOed tracks remain SOLOed until you press them back
/*  again.  				                                                                                          
/*	Note: if all the 6 tracks are SOLOed, then SOLO status is removed for the 6 tracks.                            
/*			                                                                                                       	
/*										 - TOGGLING MODE : (radio button) only one track can be SOLOed at the    	
/*  same time: SOLOing a track mutes all other, whatever was theirs previous states.                                
/*												                                                                   
/*   TOGGLING MODE is the most intuitive, but STACKED one could allow more creative patterns transitions...        	
/*	
/*	The module also allow to set mute states per pattern, so a pre-configured tracks mute setup is recalled as
/*	you change pattern on the M:S/M:C :
/*  - Toggle EDIT mode using the EDIT checkbox (playing should be stopped).
/*  - Set your mute config using the M:S/M:C track's pads.
/*	- Use the 'Lock	On Pattern' selector to pick up the pattern you want to assign the config to. Select more patterns
/*	if needed, changing or not the mute states.
/* 	- To delete a settled config, check the DELETE checkbox and use the same 'Lock	On Pattern' selector.
/*	
/*	- Hint : Patterns you want to assign a config to can also be selected directly from M:S/M:C UI, simply pressing
/*	twice the STOP button or selecting patterns with PATTERN button. To delete a config from M:S/M:C UI, select again
/*	the target pattern.
/*
/*	'Lock On Play' set to 'enabled' recall the mute config shown below each time you press Play from Logic.
/*
/*  Some additionnal settings are only editable from within the script itself, see in the header for the section
/*	labelled  " USER EDITABLE VARIABLES that are not editable from module GUI ". Explanations are given in comments.
/*	Check them as some of this setting may need to be edited to respond to your setup. If you edit the script,
/*	don't forget to press the 'Run Script' button again.
/*
/*	LIMITATION: The Mute States per pattern won't be saved when you close the Logic project, and there is no way to do
/*	so with the scripter, unfortunatly, unless using 3456 separate UI parameters...
/*	Just wait for the C++ vst/au version ;-)
/*
/*	ONLY TESTED USING USB PORT OF MODEL:SAMPLES & MODEL:CYCLES - Strange things may occur using DIN MIDI port with  
/*	'MIDI THRU' option active. Also the MIDI USB port is pretty faster than DIN MIDI, and as the MUTE events loop
/*	from and to the M:S and DAW, maybe delay will be perceptible with DIN MIDI...				
/*			                                                                                                       	
/*			                        			HOW TO USE                                                           
/*	On the Model:Samples/Cycles:
/*					-  All tracks have to be set to MIDI Channel 1 to 6, and have MIDI Out activated in TRK Menu
/*					-  If you use Direct Monitoring on the Audio track that record the device audio output, in Audio 
/*					   configuration menu of the Elektron device, set the 'Int Out' parameter either on 'AUTO' or 'OFF'
/*					-  Logic must send MIDI Clock (Settings/Synchronisation/MIDI --> check "Clock" AND "MMC")
/*                                                                                                    	
/*	To simply play Live, load the 'MODEL-SAMPLE_LIVE_MAIN OUT RECORD' template project available in the Git 
/*  repository. Be sure that your Elektron device is connected with USB before loading the project so you would not
/*	have any routing configuration to do. If your device setup is different, click on the blue button of channel strip
/*	of first track (M:S MIDI) and verify that MIDI Destination is set to the MIDI port you have connected your device to.
/*	Then check that the track labelled M:S MASTER have its input set on the Audio Inputs you have connected your 
/*	Electron device to.
/*	                                                                         
/*******************************************************NOPS©**********************************************************/


	var SoloStateMemory = 0b000000;   					// the local var holding Solos state - it's allow multiple solo-ed
																	// tracks at once
	var SoloStateTrigger = 0b000000;  					// the local var used to update M:S/M:C
	var SoloStateStartMemory = 0b000000;
	var startPreset = false;
	var logical = new Array(1,2,4,8,16,32); 		// an helper array to toggle the resp. bits of SoloState
	var isInit = true; 										// an helper boolean to detect the first key-press after Solo mode 
																	// activation
	var muteCCnumber = 94; 								// the CC that triger MUTE on M:S / M:C
	var flipMask = 0b111111; 							// another helpfull helper
	var soloMode = 0;  										// 0 = MUTE  --  1 = TOGGLING  --  2 = STACKED
	var refreshTracksUIBtns = false;
	var toggleMatrix = [ 0b111111, 0b000001, 0b000010, 0b000100, 0b001000, 0b010000, 0b100000];
	var refreshPatternMenu = false;
	var startPresetMenuString = "";
	var lastSavedValues = [];
	var refreshPlayMenu = false;
	var startPresetMenuString = "    ";
	for ( xo = 1; xo <= 6; xo++ )
	{
		startPresetMenuString += bitExtracted(SoloStateTrigger, xo) === 1 ? "⬜️   " : "🔳   ";
	}
	var startPresetEdit = 0;
	var programChangeMemory = [];			// Store Mute/Solo states per pattern   
	var programChangeMemoryName = [];
	var bankArray = new Array("A", "B", "C", "D", "E", "F");

	var lastProgramChangeMemory = 0;
	var StatesSend = false;									// If false MUTE/SOLO pads are used to setup the MUTE/SOLO states at
																	// sequence start
	var isPlaying = false;
	var newStartMode = false;
	
	var deletePatternPreset = false;

	///////////////////////////////////////// ⬇︎⬇︎⬇︎  - USER EDITABLE VARIABLES - ⬇︎⬇︎⬇︎//////////////////////////////////
 
									/* USER EDITABLE VARIABLES editable from module GUI */

	/* no needs to modify them here: do that from module GUI then use "save" option from the contextual menu of the 
		module's GUI (the one at the top of the module), and your settings will be recalled even if you unload/reload the module or if you load it from another project. */

	var settingsCC = 104;						 // the CC used to switch mode : default CC.104 Channel 1 : use the "FADE" 
	var settingsCCchannel = 1;				    // setting of LFO Setup menu of Track 1 on the M:S/M:C =>
														 //  0 = Mute mode 
														 //  1 = Toggling mode
														 //  2 = Stacked mode 
														 // this values on the M:S/M:C screen are respectively responding to CC
														 // values 64, 65, 66 but don't worry: if you choose another CC, simply sends 
														 // 0,1,2 values. Values are only remapped if CC.104 is used. This setting 
														 // could be changed from module UI.
	
	var	sendSettingsCCtoMS = true;			 // Set to true if you want Logic Scripter UI to send to M:S/M:C (or to the 
														 // controler you use) settingsCC value changes, so local tweaks are 
														 // reflected to M:S/M:C too.		
														 // The "settingsCCchannel" value will be used as MIDI channel.

									/* USER EDITABLE VARIABLES that are not editable from module GUI */

	var reScaleSettingsCCvalues = true;		// Set this flag to true if you want to use a wider range of values for 
														// switching Solo mode
	var reScaleMin = 0;							// Set reScaleMin and reScaleMax to the desired range. It's usefull if you
														// use the "FADE" setting of LFO Setup menu of Track 1 on the M:S/M:C, as 
														// it's not so handly to move the encoder only one step at once. Note that it
														// could sometime produce some weird behaviour when sendSettingsCCtoMS flag 
														// is set to true too and encoder is twisted too fast.
	var reScaleMax = 15;							// reScaleMin can not be less than 0 (no negative value).
														//  						*** IMPORTANT !!! ***
														// The remapping function needs the reScaleMax (minus reScaleMin if 
														// reScaleMin != 0) to be a multiple of 3. (i.e. 3, 6, 9, ...).

	var limitEncoderRange = true;				// with this flag set to true, the M:S/M:C encoder (and so M:S/m:C screen
														// values) won't go below or above the accepted values for the settings's 
														// CC (0 to 2 or reScale range (if set) )
														// Take care that this function works sending incoming data back to the 
														// controler so it increase MIDI traffic. I suppose it's not a good idea to 
														// set this flag if you use DIN MIDI of M:S/M:C with 'MIDI THRU' set.

	var listenProgramChange = true;				// Set to false if you don't want to send Mute/Solo states on 
															//	pattern change
	var listenProgramChangeOnlyPlay = true;	// Ignore Program change if not currently playing
	var programChangeChannel = 1;					// Edit to matche M:S/M:C setup
	
	///////////////////////////////////////// ⬆︎⬆︎⬆︎ - USER EDITABLE VARIABLES - ⬆︎⬆︎⬆︎ //////////////////////////////////



	ResetParameterDefaults = true;						// ensure that flags states are correctly updated on the GUI when
																	// loading module
	var NeedsTimingInfo = true;							// Define NeedsTimingInfo as true at the global level to enable 
																	// GetHostInfo()

function builPluginParameters()
{
	var ar = new Array();

	ar = [
		{
 			name:"mode",   // select Mute, Stacked or Toggling SOLO mode  ------ 0
 			type:"menu",
 			valueStrings:["Mute", "Toggling", "Stacked"],
 			defaultValue: soloMode,
 			minValue:0, 
 			maxValue:2,
 			disableAutomation: false,
			readOnly: false	
		},
		{
			name:"                              ⚙️",		
			type:"text",
			disableAutomation: true,
			readOnly: true
		},
 		{
 			name:"mode CC",  // select CC toggling mode  ------ 2
 			type:"menu",
 			valueStrings: MIDI._ccNames,
 			defaultValue: settingsCC,
 			disableAutomation: false,
			readOnly: false
 		},
 		{
 			name:"mode CC chan.",  // select channel of CC toggling mode  ------ 3
 			type:"linear", 
			minValue:1, 
			maxValue:16, 
			numberOfSteps:15, 
			defaultValue:settingsCCchannel,
 			disableAutomation: false,
			readOnly: false,
			data: 14
 		},
 		{
      	name: "CC out",			//  ------------ 4
      	type: "checkbox",
      	defaultValue: sendSettingsCCtoMS === true ? 1 : 0,
      	disableAutomation: false,
			readOnly: false
    	},
		{
			name:"                              🔒",    //  ------------ 5
			type:"text",
			hidden: false,
			disableAutomation: true,
			readOnly: true
		},
		{
 			name:"Lock On Play",   // select Mute sent at play  ------ 6
 			type:"menu",
 			valueStrings:["disabled", "enabled"],
 			defaultValue: startPreset === true ? 1 : 0,
 			minValue:0, 
 			maxValue:1,
 			disableAutomation: false,
			readOnly: false	
		},
		{
			name: "Edit",			//  ------------ 7 EDIT CHECKBOX
      	type: "checkbox",
      	defaultValue: startPresetEdit,
      	disableAutomation: true,
			readOnly: false
		},
		{
 			name: startPresetMenuString,   // select Mute sent at play  ------ 8
 			type:"text",
			disableAutomation: false,
			readOnly: true
		},
    	{
			name:"                               💾", //  ------------ 9
			type:"text",
			disableAutomation: false,
			readOnly: true
		},
		{
 			name:"Lock On Pattern",   //  ------ 10 Lock On Pattern
 			type:"menu",
 			valueStrings: programChangeMemoryName,
 			defaultValue:lastProgramChangeMemory,
 			minValue:0, 
 			maxValue:96,
 			hidden: false,
 			disableAutomation: false,
			readOnly: false	
		},
		{
			name: "Delete",			//  ------------ 11 delete Lock On Pattern
      	type: "checkbox",
      	defaultValue: deletePatternPreset === true ? 1 : 0,
      	disableAutomation: true,
			readOnly: false
		},
    	{
			name:"Info & add. settings: see script header",  //  ------------ 12
			type:"text",
			disableAutomation: true,
			readOnly: true
		}

	];

	// clone value to compare when ParameterChanged is called
	ar.forEach(function (v, i) 
	{
		lastSavedValues[i] = GetParameter(i) || 0;
	});

	return ar
}


// the array containing GUI controls
var PluginParameters = builPluginParameters();

// Used to detect when play is pressed
function Reset() 
{
}


function HandleMIDI(event)
{
	// if (!(event instanceof Note))
	// {
	//Trace( "MIDI INPUT : " + settingsCC );  // Debug incoming event
	// }
	// monitor Program change (pattern change)
	if ( ( listenProgramChange === true ) && ( event instanceof ProgramChange ) && ( event.channel === programChangeChannel ) && ( event.number < 96 ) )
	{
	
		// While Edit is checked, get current pattern number (program change) if the [STOP] button is 
		// pressed twice or if any other pattern is selected, and assign start preset if not set ...
		if ( startPresetEdit && ( programChangeMemory[ event.number ] === false ) )
		{
			programChangeMemory[ event.number ] = SoloStateStartMemory;
			SetStartStates(10, ( event.number + 1 ) );
			return;
		}
		// ... or delete it if set
		if ( startPresetEdit && ( programChangeMemory[ event.number ] !== false ) )
		{
			programChangeMemory[ event.number ] = false;
			SetStartStates(10, ( event.number + 1 ) );
			return;
		}
		// is playing && listenProgramChangeOnlyPlay && something is saved for this pattern?
		if ( ( ( listenProgramChangeOnlyPlay === true ) && ( GetTimingInfo().playing === false ) ) || ( programChangeMemory[ event.number ] === false ) ) 
		{
			return;
		}

		SoloStateTrigger =  programChangeMemory[ event.number ];
 
		// send
		prepareMIDIupdate( SoloStateTrigger ^ flipMask  ).then( (result) => {
			sendSolosStateToMs( result );
			
			// ...well :-), it's time to save the current SOLOs states to local memory
			if ( ( SoloStateTrigger !== 0 ) && ( SoloStateTrigger !== flipMask ) && ( soloMode === 2 ) ) 
			{
				SoloStateMemory = SoloStateTrigger;
			}
			else
			{
				SoloStateMemory = 0;
			}
		 });

		return;
	}
	
	// monitor CC which select mode and status
	if ( ( event instanceof ControlChange ) && ( event.number == settingsCC ) && ( event.channel == settingsCCchannel ) )
	{
		
		// if CC value below or above the needed range: ignore them (that save MIDI traffic) or limit them if 
		// limitEncoderRange is set to true.
		if ( ( ( limitEncoderRange === false ) && ( reScaleSettingsCCvalues === false ) && ( settingsCC === 104 ) && ( ( event.value < 64 ) || ( event.value > 66 ) ) )
			|| ( ( limitEncoderRange === false ) && ( reScaleSettingsCCvalues === true ) && ( settingsCC === 104 ) && ( ( event.value < ( 64 + reScaleMin ) ) || ( event.value > 64 + reScaleMax ) ) )
				|| ( ( limitEncoderRange === false ) && ( reScaleSettingsCCvalues === false ) && ( settingsCC !== 104 ) && ( ( event.value < 0 ) || ( event.value > 2 ) ) )
					|| ( ( limitEncoderRange === false ) && ( reScaleSettingsCCvalues === true ) && ( settingsCC !== 104 ) && ( ( event.value < reScaleMin ) || ( event.value > reScaleMax ) ) ) )
		{
				return;
		}
		else if ( ( limitEncoderRange === true ) && ( reScaleSettingsCCvalues === false ) && ( settingsCC === 104 ) && ( ( event.value < 64 ) || ( event.value > 66 ) ) )
		{
			event.value < 64 ? event.value = 64 : event.value = 66;
			limitEncoder( event );
			return;
		}
		else if ( ( limitEncoderRange === true ) && ( reScaleSettingsCCvalues === true ) && ( settingsCC === 104 ) && ( ( event.value < ( 64 + reScaleMin ) ) || ( event.value > 64 + reScaleMax ) ) )
		{
			event.value < ( 64 + reScaleMin ) ? event.value = 64 + reScaleMin : event.value = 64 + reScaleMax;
			limitEncoder( event );
			return;
		}
		else if ( ( limitEncoderRange === true ) && ( reScaleSettingsCCvalues === false ) && ( settingsCC !== 104 ) && ( ( event.value < 0 ) || ( event.value > 2 ) ) )
		{
			event.value < 0 ? event.value = 0 : event.value = 2;
			limitEncoder( event );
			return;
		}
		else if ( ( limitEncoderRange === true ) && ( reScaleSettingsCCvalues === true ) && ( settingsCC !== 104 ) && ( ( event.value < reScaleMin ) || ( event.value > reScaleMax ) ) ) 
		{
			event.value < reScaleMin ? event.value = reScaleMin : event.value = reScaleMax;
			limitEncoder( event );
			return;
		}
		

		var modeSwitchingValue = event.value;
		
		if ( ( reScaleSettingsCCvalues === true ) && ( settingsCC === 104 ) )
		{
			modeSwitchingValue -= 64;
			
			if ( modeSwitchingValue < 0 )
			{
				modeSwitchingValue = 0;
			}
			else if ( modeSwitchingValue > reScaleMax )
			{
				modeSwitchingValue = reScaleMax;
			}
		}

		else if ( ( reScaleSettingsCCvalues === false ) && ( settingsCC === 104 ) ) // the M:S is used --> CC.values must be in the range of 0 to 2 (included).
		{
			modeSwitchingValue -= 64;
			
			if ( modeSwitchingValue < 0 )
			{
				modeSwitchingValue = 0;
			}
			if ( modeSwitchingValue > 2 )
			{
				modeSwitchingValue = 2;
			}
		}
		if ( reScaleSettingsCCvalues === true )
		{
			modeSwitchingValue = modeSwitchingValue.ScaleValue( reScaleMin, reScaleMax, 0, 3 );
		}

		switch ( modeSwitchingValue ) 
		{
			case 0:  			// MUTE
				soloMode = 0;
				SetParameter( 0, 0 );
				break;
				
			case 1:			// TOGGLING
				soloMode = 1;
				SoloStateTrigger = SoloStateMemory = 0b000000;  // ensure we don't get some résiduel solos from stacked mode
				SetParameter( 0, 1 );
				break;
				
			case 2:			// STACKED
				soloMode = 2;
				SetParameter( 0, 2 );
				break;
		}

		return;
	}

	// M:S is not playing and Edit is checked for sart preset == Pads are used to configure the initial states of Mutes/Solos
	if (  ( !isPlaying ) && ( startPresetEdit === 1 ) && ( event instanceof ControlChange && event.number == muteCCnumber ) )
	{
		if ( event.value > 1 ) 
		{
			event.value = 1;
		}
			
		SetStartStates( event.channel + 20, event.value);
		return;
		
	}

	// it's a Mute event and Solo is On
	if ( ( event instanceof ControlChange && event.number == muteCCnumber ) && ( soloMode !== 0 ) && ( startPresetEdit === 0 ) )
	{ 
		// remap MIDI channel value to address correctly zero-starting arrays.
		var MidiChannel = event.channel - 1;
		
		// if it's the first time a Mute/Solo key is pressed after activating the SOLO mode, the resp. track
		// will be solo-ed regardless of its previous state (i.e. if the resp. track is Muted before the first stroke, it will be
		// right away un-muted AND solo-ed) . It's ensure that track's states are consistent with datas stored here.
		if ( isInit )
		{ 
			SoloStateTrigger = 0b000000; // reset Solo states
			SoloStateMemory = 0b000000; // reset Solo states Memory

			// force solo anyway
			SoloStateTrigger |= ( 1 << MidiChannel );
			
			isInit = false;; // so now tracks status are synced with MIDI scripter state.
			// here no needs to flip/recall other tracks solo status, all of them will be muted this (first) time.
		}
		
		else 
		{
			
			// if it's a Solo ON event ( event.value === 1 ), force pressed track to re-un-mute right away (we want to transform a mute (off) to a solo (on) )...
			// ...unless the track was previously on Solo
			if ( ( event.value === 1 ) && ( bitExtracted( SoloStateMemory, ( MidiChannel + 1 ) ) === 1 ) && ( soloMode === 2 ) ) // re-press on a (the) currently solo-ed track
			{
				
				SoloStateTrigger = SoloStateMemory;

				SoloStateTrigger &= logical[MidiChannel]; 

				SoloStateTrigger ^= SoloStateMemory;
				
				if ( SoloStateTrigger === 0b000000 ) 
					{
						SoloStateTrigger ^= flipMask;
					}

			}
			
			else // it's a press on a currently muted track or on any track if none are currently solo-ed or it's Radio Mode
			{
				if ( ( soloMode === 1 ) && ( event.value === 1 ) ) // we simply toggle the resp. bit 
				{
					var evalPreviousState = SoloStateTrigger ^ logical[MidiChannel]; 

					if ( evalPreviousState === 0 ) 
					{
						SoloStateTrigger = 0;
						SoloStateTrigger ^= flipMask; 
					}
					else 
					{
						SoloStateTrigger = logical[MidiChannel]; 
					}
				}

				else 
				{
					// Solo this track & mute others track which are currently not solo-ed
					SoloStateTrigger = ( SoloStateMemory | logical[MidiChannel] );
				}
				
			}
			
		}
		
		// prepare CC's datas...
		prepareMIDIupdate( SoloStateTrigger ^ flipMask  ).then((result) => { // last masking to revert value back to what M:S/M:C needs
			// ...and send them when they are ready to...
			sendSolosStateToMs( result );
			
			// ...well :-), it's time to save the current SOLOs states to local memory
			if ( ( SoloStateTrigger !== 0 ) && ( SoloStateTrigger !== flipMask ) && ( soloMode === 2 ) ) 
			{
				SoloStateMemory = SoloStateTrigger;
			}
			else 
			{
				SoloStateMemory = 0;
			}
		 });
		
	}
}

function ProcessMIDI() {

	var info = GetTimingInfo();  

	isPlaying = info.playing;

	if ( info.playing ) 
	{
		startPresetEdit = 0;
		if ( GetParameter(7) === 1 )
		{
			SetParameter(7, 0);
		}
		if ( GetParameter(11) === 1 )
		{
			SetParameter(11, 0);
		}
		if ( !StatesSend && startPreset )   // Send initial state
		{
			
			// load Start State from Memory
			SoloStateTrigger = SoloStateStartMemory;

			prepareMIDIupdate( SoloStateTrigger ^ flipMask  ).then((result) => { // last masking to revert value back to what M:S/M:C needs
					// ...and send them when they are ready to...
					sendSolosStateToMs( result );
					
						StatesSend = true;
					});
		}
	}
	else
	{
		isPlaying = false;
		StatesSend = false;
	}

}	

// Update settings from module UI or via CC
function ParameterChanged( pParamNumber, pValue ) 
{
	if ( !refreshPatternMenu && !refreshPlayMenu && ( pValue !== lastSavedValues[pParamNumber] ) ) 
	{

		var nop = false;

		switch ( pParamNumber )
		{
			case 0: 								// SOLO mode selector
					
					lastSavedValues[pParamNumber] = pValue;

					switch ( pValue )
					{
						case 0 :
								soloMode = 0;
							break;
	
						case 1 :
							soloMode = 1;
							SoloStateTrigger = 0b000000;  // ensure we don't get some résiduel solos from stacked mode
							SoloStateMemory = 0b000000;
							break;
	
						case 2 :
							soloMode = 2;
							break;			
			   	 }
			    break;	
	
			case 2: 						// SOLO mode selector CC number
				lastSavedValues[pParamNumber] = pValue;
				settingsCC = pValue;
				nop = true;
				break;

			case 3: 						// SOLO mode selector CC channel
				lastSavedValues[pParamNumber] = pValue;
				settingsCCchannel = pValue;
				nop = true;
				break;
	
			case 4: 						// toggle sendSettingsCCtoMS on/off
				lastSavedValues[pParamNumber] = pValue;
				pValue === 1 ? sendSettingsCCtoMS = true : sendSettingsCCtoMS = false;
				break;
	
			case 6:
				nop = true;
				if ( !isPlaying ) 
				{
					SetStartStates(pParamNumber, pValue);
				}
				break;

			case 7: 				//  ------------ 7 EDIT CHECKBOX
				nop = true;
				lastSavedValues[pParamNumber] = pValue;
				switch ( pValue )
				{
					case 0:
						startPresetEdit = 0;
						break;
	
					case 1:
						startPresetEdit = 1;
						SetStartStates(pParamNumber, pValue);
						break;
				}
				break;

			case 10: 									//  ------ 10 Lock On Pattern
				if ( !isPlaying && startPresetEdit === 1 && !deletePatternPreset ) 
				{
					programChangeMemory[ pValue - 1 ] = SoloStateStartMemory;
	
					SetStartStates(pParamNumber, pValue);
				}
				else if ( !isPlaying && deletePatternPreset && startPresetEdit === 1 ) 
				{
					programChangeMemory[ pValue - 1 ] = false;
	
					SetStartStates(pParamNumber, pValue);
				}
				nop = true;
				break;

			case 11:  				//  ------------ 11 delete Lock On Pattern
				lastSavedValues[pParamNumber] = pValue;
				if ( !isPlaying && startPresetEdit === 1 ) 
				{
					if ( pValue === 1 )
					{
						deletePatternPreset = true;
					}
					else
					{
						deletePatternPreset = false;
					}
					nop = true;
					break;
				}
			default:
				lastSavedValues[pParamNumber] = pValue;
			   nop = true;
			   break;
		}
	

		if ( !nop && ( pParamNumber === 0 ) && sendSettingsCCtoMS ) // Call from UI, must update M:S CC
		{	
		 	var settingsCcValue = pValue;
	
		 	if ( reScaleSettingsCCvalues === true )
			{
	
				settingsCcValue = settingsCcValue.ScaleValue(0, 3, reScaleMin, reScaleMax);
				// when CC value step down to the range resp. to the lower value, it jump to the lowest value of this range
				// so when it happen we add (reScaleMax / 3)- 1
				if ( settingsCcValue <= ( ( GetParameter(pParamNumber) + ( reScaleMax - reScaleMin ) / 3 ) ) ) 
				{
					settingsCcValue += ( ( ( reScaleMax - reScaleMin ) / 3 ) - ( Math.floor( ( ( ( reScaleMax - reScaleMin ) / 3 ) / 2 ) ) ) );
				}
	
			}
		 			
		 	if ( settingsCC === 104 ) 
		 	{
		 	
		 		settingsCcValue += 64;  // remap value if the "FADE" setting of LFO Setup menu of Track 1 on the M:S/M:C
		 			
		 	}
		 			
		 	var outGoingCC = new ControlChange();
		 	outGoingCC.channel = settingsCCchannel;
		 	outGoingCC.number = settingsCC;
		 	outGoingCC.value = settingsCcValue;
		 	outGoingCC.send();
		}
	}
	else 
	{
		refreshPatternMenu = false;
		refreshPlayMenu = false;
	}
}





// Set the initial state of the mute for each track
function SetStartStates( param, value )
{

	var midiSend = false;
	if ( !refreshPlayMenu && !refreshPatternMenu)
	{
		
		switch( param )
				{
					case 6:
						switch( value )
						{
							case 0:
								if ( value !== lastSavedValues[param] )
								{
									lastSavedValues[param] = value;
									startPreset = false;
									SoloStateTrigger = SoloStateMemory;
								}
								else
								{
									refreshPlayMenu = false;
								}
								break;
		
							case 1:
								if ( value !== lastSavedValues[param] )
								{
									lastSavedValues[param] = value;
									startPreset = true;
									SoloStateTrigger = SoloStateStartMemory;
								}
								else
								{
									refreshPlayMenu = false;
								}
								
								break;

							default:
								break;

						}
				    	break;

				   case 7:
						if ( startPreset )
						{
							SoloStateTrigger = SoloStateStartMemory;
						}
						//Update GUI
						startPresetMenuString = "     ";
						for ( var loop = 1; loop <= 6; loop++ )
						{
							startPresetMenuString += bitExtracted(SoloStateTrigger, loop) === 1 ? "⬜️   " : "🔳   ";
						}
				   	midiSend = true;
						refreshPlayMenu = true;
						PluginParameters = builPluginParameters();
						UpdatePluginParameters();	
						break;

					case 21:  // come from midi mute events, not GUI
					case 22:
					case 23:
					case 24:
					case 25:
					case 26:
						if ( !refreshPlayMenu && ( startPresetEdit === 1 ) &&  !isPlaying )
						{
							SoloStateTrigger = SoloStateTrigger ^ ( 1 << ( param - 21 ) );
							SoloStateStartMemory = SoloStateTrigger;
							//Update GUI
							startPresetMenuString = "     ";
							for ( var loop = 1; loop <= 6; loop++ )
							{
								startPresetMenuString += bitExtracted(SoloStateTrigger, loop) === 1 ? "⬜️   " : "🔳   ";
							}
							 
							refreshPlayMenu = true;
							PluginParameters = builPluginParameters();
							UpdatePluginParameters();
							refreshPatternMenu = false;
						 	refreshPlayMenu = false;	
							
						}
						else
						{
							refreshPlayMenu = false;
						}
						break;

					case 10: 					//  ------ 10 Lock On Pattern
						if ( !refreshPatternMenu && !isPlaying )
						{
							programChangeMemoryName[0] = "Select...";
	
							for ( var o  =  1; o <= bankArray.length; o++ )
							{
								for ( var i = 0; i <= 15; i++ )
								{
									var k = bankArray[ o - 1 ] + " - P " + (i + 1);
									var idxx = i + ( (o - 1) * 16 );    
									if ( programChangeMemory[ idxx ] !== false )    // cosmetic: special char suitable : ⚈ ⚆
									{																// ☀︎ ☼  ⊙ ⊙  ☒ ☐  ◉ 
										k += "  ";												// ● ◯ ◯  ◉ ◯
										for ( var loop = 1; loop <= 6; loop++ )
										{
											bitExtracted(programChangeMemory[ idxx ], loop) === 1 ? k += "⬜️  " : k += "🔳  ";
										}
									} 
									programChangeMemoryName[(i + ( o * 16 )) + 1] = k;								
								}
							}
							
							lastProgramChangeMemory = value;
							refreshPatternMenu = true;
							PluginParameters = builPluginParameters();
							UpdatePluginParameters();
							refreshPatternMenu = false;
						 	refreshPlayMenu = false;

						}
						else
						{
							refreshPatternMenu = false;
						}
						break;

				default:
					break;		
				}

		if ( midiSend )
		{
			// Trace(" midiSend ");
			prepareMIDIupdate( SoloStateTrigger ^ flipMask  ).then((result) => { 
						// ...and send them when they are ready to...
						sendSolosStateToMs( result );
						
							midiSend = false;
						});
		}

	}

}

// triggered when scripter have nothing else to do
function Idle() 
{
}	

// triggered when scripter is loaded for the first time
function Initialize() 
{	
	if ( programChangeMemory.length === 0 )
	{
		programChangeMemoryName[0] = "Select...";
		for ( var o  =  1; o <= bankArray.length; o++ )
		{
			for ( var i = 0; i <= 15; i++ )
			{
				var k = bankArray[ o - 1 ] + " - P " + (i + 1); 
				programChangeMemory[ i + ( (o - 1) * 16 ) ] = false;
				programChangeMemoryName[(i + ( o * 16 )) + 1] = k;
			}
		}
	}
	
	// ensure that user-editable variables value are valid
	reScaleMin = MIDI.normalizeData( reScaleMin );
	reScaleMax = MIDI.normalizeData( reScaleMax );
	settingsCC = MIDI.normalizeData( settingsCC );
	settingsCCchannel = MIDI.normalizeChannel( settingsCCchannel );
}	


// this function loop-send incoming settings CC value if limitEncoderRange flag is set
// to true and the value is below or above the accepted range
function limitEncoder( event )
{
	event.send();
}

// this function finally send the updated SOLO CCs status
function sendSolosStateToMs( allChannelCCpack ) 
{
	allChannelCCpack.forEach(function (cc) 
	{
		cc.send(); 
	});
}


// This function prepare the CC messages to be send
var prepareMIDIupdate = function(currentSoloState) {
	
	return new Promise(function(resolve, reject) {
		
		var datasPack = new Array(); // the array we will return.
		
		for ( var zou = 1; zou < 7 ; zou++) {
 
 			datasPack[zou] = new ControlChange;  
			datasPack[zou].channel = zou;
 			datasPack[zou].number = muteCCnumber;   // set it to controller 94 (mute)
 			datasPack[zou].value = bitExtracted(currentSoloState,zou);   // set the value
		}

		
		if ( zou == 7 ) {
			var ready = datasPack;
			resolve( ready );
		}
		
		else {
   			
   			reject( Trace( "something went wrongz..." ) );
  		}
  		
  	});
}


// Function to extract one bit from p position
// and returns the extracted value as integer
function bitExtracted(sourceNum, bitPosition)
{
    return (1 & (sourceNum >> (bitPosition - 1)));
}

// Function to rescale MIDI values to a given range
Number.prototype.ScaleValue = function (in_min, in_max, out_min, out_max) 
{
  return Math.floor( (this - in_min) * (out_max - out_min) / (in_max - in_min) + out_min );
}




// a helper function only used to display as binary the SoloState var. in monitor

function padStart(string, length, char) {
  return length > 0 ?
    padStart(char + string, --length, char) :
    string;
}
function numToString(num, radix, length = num.length) {
  const numString = num.toString(radix);
  return numString.length === length ?
    numString :
    padStart(numString, length - numString.length, "0")
}