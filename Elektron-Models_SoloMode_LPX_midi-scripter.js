/*******************************************************NOPS©**********************************************************/
/**********************************************************************************************************************/
/*			                                                                                                       	
/*  THIS SCRIPTER MODULE ALLOWS TO USE THE MUTE FUNCTION OF MODEL:SAMPLES & MODEL:CYCLES AS A SOLO FUNCTION        	
/*			- TWO MODES ARE AVAILABLE :	                                                                          	
/*										 - STACKED (default) : multiple tracks can be SOLOed at the same time.		
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
/*	ONLY TESTED USING USB PORT OF MODEL:SAMPLES & MODEL:CYCLES - Strange things may occur using DIN MIDI port with  
/*	'MIDI THRU' option active. Also the MIDI USB port is pretty faster than DIN MIDI, and as the MUTE events loop
/*	from and to the M:S and DAW, maybe delay will be perceptible with DIN MIDI...				
/*			                                                                                                       	
/*			                        			HOW TO USE                                                           
/*	On the Model:Samples/Cycles:
/*					-  All tracks have to be set to MIDI Channel 1 to 6, and have MIDI Out activated in TRK Menu
/*					-  If you use Direct Monitoring on the Audio track that record the device audio output, in Audio 
/*					   configuration menu of the Elektron device, set the 'Int Out' parameter either on 'AUTO' or 'OFF'
/*                                                                                                    	
/*	To simply play Live, load the 'MODEL-SAMPLE_LIVE_MAIN OUT RECORD' template project available in the Git 
/*  repository. Be sure that your Elektron device is connected with USB before loading the project so you would not
/*	have any routing configuration to do. If your device setup is different, click on the blue button of channel strip
/*	of first track (M:S MIDI) and verify that MIDI Destination is set to the MIDI port you have connected your device to.
/*	Then check that the track labelled M:S MASTER have its input set on the Audio Inputs you have connected your 
/*	Electron device to.
/*
/*	To record MIDI separatly for the 6 tracks and the main out on an audio track, load the project named 
/*	'MODEL-SAMPLE_MIDI_MULTITRACK'. Arm record for all tracks and ensure that one of the 'M:S MIDI x' track is currently 
/*	selected while you press RECORD button (if not, the MIDI tracks won't record anything, what a crappy behaviour..).
/*	                                                                         
/*******************************************************NOPS©**********************************************************/



	var SoloStateMemory = 0b000000;   					// the local var holding Solos state - it's allow multiple solo-ed
																	// tracks at once
	var SoloStateTrigger = 0b000000;  					// the local var used to update M:S/M:C
	var SoloStateStartMemory = 0b111111;
	var SoloStateStartMemoryMute = 0b111111;
	var SoloStateStartMemoryToggling = 0b111111;
	var SoloStateStartMemoryStacked = 0b111111;
	var soloModeStart = 0;
	var startModeLock = 0;
	const logical = new Array(1,2,4,8,16,32); 		// an helper array to toggle the resp. bits of SoloState
	var isInit = true; 										// an helper boolean to detect the first key-press after Solo mode 
																	// activation
	const muteCCnumber = 94; 								// the CC that triger MUTE on M:S / M:C
	const flipMask = 0b111111; 							// another helpfull helper
	var soloMode = 0;  										// 0 = MUTE  --  1 = TOGGLING  --  2 = STACKED
	var StartStateOn = false;
	var refresh = false;
	var refreshTracksUIBtns = false;
	const toggleMatrix = [ 0b111111, 0b000001, 0b000010, 0b000100, 0b001000, 0b010000, 0b100000];

	var programChangeMemory = new Array();			// Store Mute/Solo states per pattern
	let bankArray = new Array("A", "B", "C", "D", "E", "F");
	for ( var o  =  1; o <= bankArray.length; o++ )
	{
		for ( var i = 0; i <= 15; i++ )
		{
			let k = "BANK " + bankArray[ o - 1 ] + " - PATTERN " + toString( i + 1 ); 
			programChangeMemory[ i + ( o * 16 ) ] = { "name" : k, "value" : toggleMatrix[0] };
		}
	}
	var StatesSend = false;									// If false MUTE/SOLO pads are used to setup the MUTE/SOLO states at
																	// sequence start
	var isPlaying = false;
	var modeSelect = false;
	var newStartMode = false;
	const startPresetNames = ["disabled", "mute", "toggling", "stacked"];

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
														// The remapping function needs the reScaleMax (minus reScaleMin if 
														// reScaleMin != 0) to be a multiple of 3. (i.e. 3, 6, 9, ...).

	var limitEncoderRange = true;				// with this flag set to true, the M:S/M:C encoder (ans so M:S/m:C screen
														// values) won't go below or above the accepted values for the settings's 
														// CC (0 to 2 or reScale range (if set) )
														// Take care that this function works sending incoming data back to the 
														// controler so it increase MIDI traffic. I suppose it's not a good idea to set this flag if you use DIN MIDI of M:S/M:C with 'MIDI THRU' set.

	var listenProgramChange = true;				// Set to false if you don't want to send Mute/Solo states on 
															//	pattern change
	var listenProgramChangeOnlyPlay = true;	// Ignore Program change if not currently playing
	var programChangeChannel = 1;					// Edit to matche M:S/M:C setup
	
	///////////////////////////////////////// ⬆︎⬆︎⬆︎ - USER EDITABLE VARIABLES - ⬆︎⬆︎⬆︎ //////////////////////////////////



	ResetParameterDefaults = true;						// ensure that flags states are correctly updated on the GUI when
																	// loading module
	var NeedsTimingInfo = true;							// Define NeedsTimingInfo as true at the global level to enable 
																	// GetHostInfo()

// Used to detect when play is pressed
function Reset() 
{
   PluginParameters[0] = {
			name:"mode",   // select Mute, Stacked or Toggling SOLO mode  ------ 0
 			type:"menu",
 			valueStrings:["Mute", "Toggling", "Stacked"],
 			defaultValue: soloMode,
 			minValue:0, 
 			maxValue:2,
 			disableAutomation: false,
			readOnly: false	
   };
   soloModeStart = 0;
   SetParameter( 19, 1);

}


function HandleMIDI(event)
{
	if (!(event instanceof Note))
	{
	Trace( "MIDI INPUT : " + programChangeMemory[ event.number ] );  // Debug incoming event
	}

	// monitor Program change (pattern change)
	if ( ( listenProgramChange === true ) && ( event instanceof ProgramChange ) && ( event.channel === programChangeChannel ) && ( event.number < 96 ) )
	{
		// is playing && listenProgramChangeOnlyPlay ?
		if ( ( listenProgramChangeOnlyPlay === true ) && ( GetTimingInfo().playing === false ) ) 
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

	// M:S is not playing and Start Mode is not on Disabled == Pads are used to configure the initial states of Mutes/Solos
	if ( ( event instanceof ControlChange && event.number == muteCCnumber ) && ( !isPlaying ) && ( !startModeLock ) && ( soloModeStart > 0 ))
	{
		if ( event.value > 1 ) 
		{
			event.value = 1;
		}
		if ( newStartMode ) 
		{
			modeSelect = false; 
			newStartMode = false;
		}
		if ( soloModeStart === 2 )
		{
			SetStartStates( event.channel + 6, 1 );
			return;
		}
		else
		{
			SetStartStates( event.channel + 6, event.value);
			return;
		}
		
	}

	// it's a Mute event and Solo is On
	if ( ( event instanceof ControlChange && event.number == muteCCnumber ) && ( soloMode !== 0 ) ) 
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

// the array containing GUI controls
var PluginParameters = 
	[
		{
 			name:"mode",   // select Mute, Stacked or Toggling SOLO mode  ------ 0
 			type:"menu",
 			valueStrings:["Mute", "Toggling", "Stacked"],
 			defaultValue:0,
 			minValue:0, 
 			maxValue:2,
 			disableAutomation: false,
			readOnly: false	
		},
		{
			name:"Settings",		
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
			name:"Start Preset",    //  ------------ 5
			type:"text",
			hidden: false,
			disableAutomation: true,
			readOnly: true
		},
		{
 			name:"Preset",   // select Mute mode or Stacked or Toggling SOLO mode  ------ 6
 			type:"menu",
 			valueStrings:["disabled", "Mute", "Toggling", "Stacked"],
 			defaultValue:0,
 			minValue:0, 
 			maxValue:3,
 			disableAutomation: false,
			readOnly: false	
		},
		{
      	name: "TRACK 1", 		//  ------------ 7
      	type: "checkbox",
      	defaultValue: 1,
      	hidden: false,
      	disableAutomation: false,
			readOnly: true
    	},
		{
      	name: "TRACK 2", 		//  ------------ 8
      	type: "checkbox",
      	defaultValue: 1,
      	hidden: false,
      	disableAutomation: false,
			readOnly: true
    	},
		{
      	name: "TRACK 3", 		//  ------------ 9
      	type: "checkbox",
      	defaultValue: 1,
      	hidden: false,
      	disableAutomation: false,
			readOnly: true
    	},
		{
      	name: "TRACK 4", 		//  ------------ 10
      	type: "checkbox",
      	defaultValue: 1,
      	hidden: false,
      	disableAutomation: false,
			readOnly: true
    	},
		{
      	name: "TRACK 5", 		//  ------------ 11
      	type: "checkbox",
      	defaultValue: 1,
      	hidden: false,
      	disableAutomation: false,
			readOnly: true
    	},
		{
      	name: "TRACK 6", 		//  ------------ 12
      	type: "checkbox",
      	defaultValue: 1,
      	hidden: false,
      	disableAutomation: false,
			readOnly: true,
    	},
    	{
      	name: "TRACK 1 : ", 		//  ------------ 13
      	type: "checkbox",
      	defaultValue: bitExtracted( SoloStateStartMemory, 1 ),
      	hidden: true,
      	disableAutomation: false,
			readOnly: true
    	},
		{
      	name: "TRACK 2 : ", 		//  ------------ 14
      	type: "checkbox",
      	defaultValue: bitExtracted( SoloStateStartMemory, 2 ),
      	hidden: true,
      	disableAutomation: false,
			readOnly: true
    	},
		{
      	name: "TRACK 3 : ", 		//  ------------ 15
      	type: "checkbox",
      	defaultValue: bitExtracted( SoloStateStartMemory, 3 ),
      	hidden: true,
      	disableAutomation: false,
			readOnly: true
    	},
		{
      	name: "TRACK 4 : ", 		//  ------------ 16
      	type: "checkbox",
      	defaultValue: bitExtracted( SoloStateStartMemory, 4 ),
      	hidden: true,
      	disableAutomation: false,
			readOnly: true
    	},
		{
      	name: "TRACK 5 : ", 		//  ------------ 17
      	type: "checkbox",
      	defaultValue: bitExtracted( SoloStateStartMemory, 5 ),
      	hidden: true,
      	disableAutomation: false,
			readOnly: true
    	},
		{
      	name: "TRACK 6 : ", 		//  ------------ 18
      	type: "checkbox",
      	defaultValue: bitExtracted( SoloStateStartMemory, 6 ),
      	hidden: true,
      	disableAutomation: false,
			readOnly: true
    	},
    	{
      	name: "Lock", 		//  ------------ 19
      	type: "checkbox",
      	defaultValue: 0,
      	hidden: false,
      	disableAutomation: false,
			readOnly: false
    	},
    	{
      	name: "Lock", 		//  ------------ 20
      	type: "checkbox",
      	defaultValue: 1,
      	hidden: true,
      	disableAutomation: true,
			readOnly: false
    	},
    	{
			name:"[FUNC] + PADs to set your selection", //  ------------ 21
			type:"text",
			disableAutomation: false,
			readOnly: true
		},
    	{
			name:"Info & add. settings: see script header",  //  ------------ 22
			type:"text",
			disableAutomation: true,
			readOnly: true
		}

	];



// Update settings from module UI or via CC
function ParameterChanged( pParamNumber, pValue ) 
{
	var nop = false;
	switch ( pParamNumber )
	{
		case 0: 								// SOLO mode selector
			if ( !refresh )
			{

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
		    }
		    break;	

		case 2: 						// SOLO mode selector CC number
			if ( !refresh )
			{
				settingsCC = pValue;
			}
			nop = true;
			break;

		case 3: 						// SOLO mode selector CC channel
			if ( !refresh )
			{
				settingsCCchannel = pValue;
			}
			nop = true;
			break;

		case 4: 						// toggle sendSettingsCCtoMS on/off	
			if ( !refresh )
			{	
				pValue === 1 ? sendSettingsCCtoMS = true : sendSettingsCCtoMS = false;
			}
			break;

		case 6:
			// nop = true;
			if ( !isPlaying ) 
			{
				if ( ( startModeLock === 0 ) && ( !refresh ) )
				{
					soloModeStart = pValue;
					soloMode = soloModeStart - 1;
					if ( soloMode < 0 ) 
					{
						soloMode = 0;
					}
					SetStartStates(pParamNumber, pValue);
					break;
				}
				if ( startModeLock === 1 ) 
				{
					SetStartStates(pParamNumber, soloModeStart);
					break;
				}
			}
			break;

		case 7:
		case 8:
		case 9:
		case 10:
		case 11:
		case 12:
		case 13:
		case 14:
		case 15:
		case 16:
		case 17:
		case 18:
			nop = true;
			break;

		case 19:
			nop = true;
			if ( ( !isPlaying  ) && ( startModeLock !== pValue ) )
			{
				
					if ( !refresh && startModeLock == 0 ) 
					{
					startModeLock = 1;
					SetParameter( 0, soloModeStart );
					SetStartStates(pParamNumber, pValue);
					break;
					}
			}
			
			break;

		case 20:
			nop = true;
			
			if ( ( !isPlaying  ) && ( startModeLock !== pValue ) )
			{
				if ( !refresh && startModeLock == 1 ) 
				{	
					startModeLock = 0;
					SetStartStates(pParamNumber, pValue);
					break;
				}
			}
			break;


		default:
		   nop = true;
		   break;
	}


	if ( !nop && pParamNumber === 0 && sendSettingsCCtoMS ) // Call from UI, must update M:S CC
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
	 			
	 	var outGoingCC = new ControlChange;
	 	outGoingCC.channel = settingsCCchannel;
	 	outGoingCC.number = settingsCC;
	 	outGoingCC.value = settingsCcValue;
	 	Trace( "outGoingCC : " + outGoingCC.value + " pValue : " + pValue );
	 	outGoingCC.send();
			
	}
}



function ProcessMIDI() {

	var info = GetTimingInfo();  

	isPlaying = info.playing;

	if ( info.playing ) 
	{
		if ( !StatesSend && StartStateOn )   // Send initial state
		{
			
			// load Start State from Memory
			SoloStateTrigger = SoloStateStartMemory;
			
			// hide Unlock checkbox while playing
			PluginParameters[20].hidden = true;	
			
			refresh = true; 
			
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
		StartStateOn ? StatesSend = false : StatesSend = true;
		if ( ( PluginParameters[20].hidden === true ) && ( startModeLock === 1) )
		{
			PluginParameters[20].hidden = false;
			refresh = true; 
		}	

	}

}

// Set the initial state of the mute mode and the status for each track
function SetStartStates( param, value )
{
	
	if ( !isPlaying  )
	{
		
		switch( param )
				{
					case 6:
						soloModeStart = value;
						
						switch( soloModeStart )
						{
							case 0:
								SoloStateTrigger = 0b111111;
								// save
								SoloStateStartMemory = SoloStateTrigger;
								 newStartMode = true;
								break;

							case 1:
								SoloStateTrigger = SoloStateStartMemoryMute;
								break;

							case 2:
								SoloStateTrigger = SoloStateStartMemoryToggling;
								break;

							case 3:
								SoloStateTrigger = SoloStateStartMemoryStacked;
								break;

						}

						refreshTracksUIBtns = true;
						modeSelect = true;
						
	    				newStartMode = true;
				    	break;				

					case 7:
					case 8:
					case 9:
					case 10:
					case 11:
					case 12:
						switch( soloModeStart )
						{
							case 0:
								modeSelect = true;
								SoloStateTrigger = 0b111111;

								refreshTracksUIBtns = true;

	    						newStartMode = true;
								StartStateOn = false;
								break;;
								
							case 1:	// Mutes
								SoloStateTrigger = SoloStateStartMemoryMute;									
								SoloStateTrigger = SoloStateTrigger ^ ( 1 << ( param - 7 ) );
								SoloStateStartMemoryMute = SoloStateTrigger;
								StartStateOn = true;
								newStartMode = true;
								break;

							case 2:  // TOGGLING
								var evalPreviousState = SoloStateTrigger ^ logical[ param - 7 ]; 
								if ( evalPreviousState === 0 ) // a solo is unsoloed
								{
									SoloStateTrigger = toggleMatrix[ 0 ];  // so all to one
								}
								else 							
								{
									SoloStateTrigger = toggleMatrix[ param - 6 ];
								}
								SoloStateStartMemoryToggling = SoloStateTrigger;
								newStartMode = true;
								StartStateOn = true;
								break;

							case 3:  // STACKED
								if ( SoloStateMemory === 0b000000 )
								{
									SoloStateMemory |= ( 1 << ( param - 7 ) );
								}
								else
								{
									SoloStateMemory = SoloStateMemory ^ ( 1 << ( param - 7 ) );
								}

								SoloStateTrigger = SoloStateMemory;
								SoloStateStartMemoryStacked = SoloStateMemory;

								if ( SoloStateTrigger === 0b000000 )
								{
									SoloStateTrigger = 0b111111;
								}
								newStartMode = true;
								StartStateOn = true;							
								break;

							default:
								break;
						}

						// save
						SoloStateStartMemory = SoloStateTrigger;

						//Update GUI
						refreshTracksUIBtns = true;

						break;

						default:
						break;
				}

	}



	if ( param === 19 && value == 1 && !refresh )
	{
		startModeLock = 1;
		Trace("SoloStateTrigger  PluginParameters : " + SoloStateTrigger );
		SoloStateTrigger = SoloStateStartMemory;
		PluginParameters[6] = 
		{
 			name: "Preset : " + startPresetNames[soloModeStart],   // select Mute mode or Stacked or Toggling SOLO mode  ------ 6
 			type:"text",
 			disableAutomation: false,
			readOnly: false	
		};

		PluginParameters[5].hidden = true;
		PluginParameters[19].hidden = true;

		PluginParameters[7].hidden = true;
		PluginParameters[8].hidden = true;
		PluginParameters[9].hidden = true;
		PluginParameters[10].hidden = true;
		PluginParameters[11].hidden = true;
		PluginParameters[12].hidden = true;  

		PluginParameters[13].defaultValue = ( bitExtracted( SoloStateStartMemory, 1 ) === 1 ) ? 1 : 0;
		PluginParameters[14].defaultValue = ( bitExtracted( SoloStateStartMemory, 2 ) === 1 ) ? 1 : 0;
		PluginParameters[15].defaultValue = ( bitExtracted( SoloStateStartMemory, 3 ) === 1 ) ? 1 : 0;
		PluginParameters[16].defaultValue = ( bitExtracted( SoloStateStartMemory, 4 ) === 1 ) ? 1 : 0;
		PluginParameters[17].defaultValue = ( bitExtracted( SoloStateStartMemory, 5 ) === 1 ) ? 1 : 0;
		PluginParameters[18].defaultValue = ( bitExtracted( SoloStateStartMemory, 6 ) === 1 ) ? 1 : 0;

		PluginParameters[13].hidden = false;
		PluginParameters[14].hidden = false;
		PluginParameters[15].hidden = false;
		PluginParameters[16].hidden = false;
		PluginParameters[17].hidden = false;
		PluginParameters[18].hidden = false;

		PluginParameters[20].hidden = false;	

		refresh = true; 
		//refreshUI();
		newStartMode = false;

	}

	else if ( param === 20 && value == 0 && !refresh )
	{
		Trace("SoloStateTrigger  startModeLock 0  : " + SoloStateTrigger );

		startModeLock === 0;
	
		PluginParameters[6] = 
		{
 			name:"Preset",   // select Mute mode or Stacked or Toggling SOLO mode  ------ 6
 			type:"menu",
 			valueStrings:["disabled", "Mute", "Toggling", "Stacked"],
 			defaultValue:soloModeStart,
 			minValue:0, 
 			maxValue:3,
 			disableAutomation: false,
			readOnly: false	
		};

		PluginParameters[5].hidden = false;
		PluginParameters[20].hidden = true;

		PluginParameters[12].hidden = true;
		PluginParameters[13].hidden = true;
		PluginParameters[14].hidden = true;
		PluginParameters[15].hidden = true;
		PluginParameters[16].hidden = true;
		PluginParameters[17].hidden = true;
		PluginParameters[18].hidden = true;

		PluginParameters[7].hidden = false;
		PluginParameters[8].hidden = false;
		PluginParameters[9].hidden = false;
		PluginParameters[10].hidden = false;
		PluginParameters[11].hidden = false;
		PluginParameters[12].hidden = false;

		PluginParameters[19].hidden = false;
			
		refresh = true;
		//refreshUI();
		
		newStartMode = true;
	}


		if ( newStartMode  )  // Update M:S 
	{
		Trace("SoloStateTrigger  prepareMIDIupdate : " + SoloStateTrigger );
		prepareMIDIupdate( SoloStateTrigger ^ flipMask  ).then((result) => { // last masking to revert value back to what M:S/M:C needs
						// ...and send them when they are ready to...
						sendSolosStateToMs( result );
						
							StartStateOn = true;
							modeSelect = false;
							newStartMode = false;
							
						});			
	}
		
}

	

function refreshUI()
{
	if ( refresh )
	{
		UpdatePluginParameters();			
		refresh = false;
	}
}

// triggered when scripter have nothing else to do, about 4 times per second ( as I know, not sure )
function Idle() 
{
		if ( refresh )
		{
			UpdatePluginParameters();			
			refresh = false;
		}

		if ( refreshTracksUIBtns )
		{
			//Update GUI
			SetParameter( 7, bitExtracted( SoloStateTrigger, 1 ) === 1 ? 1 : 0 );
			SetParameter( 8, bitExtracted( SoloStateTrigger, 2 ) === 1 ? 1 : 0 );
			SetParameter( 9, bitExtracted( SoloStateTrigger, 3 ) === 1 ? 1 : 0 );
			SetParameter( 10, bitExtracted( SoloStateTrigger, 4 ) === 1 ? 1 : 0 );
			SetParameter( 11, bitExtracted( SoloStateTrigger, 5 ) === 1 ? 1 : 0 );
			SetParameter( 12, bitExtracted( SoloStateTrigger, 6 ) === 1 ? 1 : 0 );
			refreshTracksUIBtns = false;
		}
}	

// triggered when scripter is loaded for the first time and when you switch to another MIDI module then switch to this one again
// Unfortunately, here I use the ResetParameterDefaults flag that do the job better as ParameterChanged array seems to be not loaded at the time
// this Initialize() function is executed :-(
// So, default (original) settings will be always recalled unless you use "save" option from the contextual menu of the 
// module's GUI (the one at the top of the module GUI)
function Initialize() 
{	
	// ensure that user-editable variables value are valid
	reScaleMin = MIDI.normalizeData( reScaleMin );
	reScaleMax = MIDI.normalizeData( reScaleMax );
	settingsCC = MIDI.normalizeData( settingsCC );
	settingsCCchannel = MIDI.normalizeChannel( settingsCCchannel );

}	


// this function loop-send incoming settings CC value if limitEncoderRange flag is set to true and the value is below or above the 
// accepted range
function limitEncoder( event )
{
	event.send();
}

// this function finally send the updated SOLO CCs status
function sendSolosStateToMs( allChannelCCpack ) 
{
	allChannelCCpack.forEach(function (cc) 
	{
		// Trace("SOLO OUT : " + cc + "  solomode :" + soloMode + "  solomodeStart :" + soloModeStart); // debug SOLO's MIDI output
		cc.send(); 
	});
	delete allChannelCCpack;
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



//could be usefull to sniff object's properties
// Trace(JSON.stringify(ObjectToAnalyze, null, 4))