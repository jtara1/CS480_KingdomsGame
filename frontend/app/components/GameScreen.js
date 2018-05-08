import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, AsyncStorage,} from 'react-native';
import { StackNavigator } from 'react-navigation'; // Version can be specified in package.json
import MapView from 'react-native-maps';
import {Marker, Circle} from 'react-native-maps';
import CountDown from 'react-native-countdown-component';

import BaseConnection from 'kingdoms-game-sdk/src/BaseConnection';
import Game from 'kingdoms-game-sdk/src/Game';

import castleImg from '../assets/castle256.png'
import fortImg from '../assets/fort256.png'
import redCastleImg from '../assets/redcastle256.png'
import redFortImg from '../assets/redfort256.png'
import blueCastleImg from '../assets/bluecastle256.png'
import blueFortImg from '../assets/bluefort256.png'

import IP from '../../config';

export default class GameScreen extends React.Component {

    constructor(props){
        super(props);
        this.state = {
            region: {
                latitude: 34.0576,
                longitude: -117.8207,
                latitudeDelta: 0.0922,
                longitudeDelta: 0.0421,
            },
            playerMarkers:[
                {
                    coordinate: {
                        latitude: 34.0576,
                        longitude: -117.820,
                    },
                    title: "User",
                    pinColor: '#0000ff',
                },
                {
                    coordinate: {
                        latitude: 34.0577,
                        longitude: -117.821,
                    },
                    title: "Enemy",
                    pinColor: '#ff0000',
                },
            ],
            userID: null,
            gameID: '',
            error: null,
            regionSet: false,
            timer: null,
            numErrors: 0,
            nodes: [],
            initialStateSet: false,
            initialGetGame: false,
            score: 0,
            enemyScore: 0,
            timeLeft: 10,
        };
        //initial game id
        const {params} = this.props.navigation.state;
        this.state.gameID = params.gameID;

        //initial region
        this.state.region = {
            latitude: params.lat,
            longitude: params.lon,
            latitudeDelta: 0.01,
            longitudeDelta: 0.0011,
        };

        let baseConn = new BaseConnection( IP ,'3000');
        this.game = new Game(baseConn, WebSocket);
        this.game.id = this.state.gameID;

      /**
       * getCurrentPosition will be called every x seconds where
       * x is this value
       * @type {number}
       */
        this.geolocationUpdatePeriod = 3000;
    }

    componentWillUnmount(){
        clearInterval(this.state.timer);
    }

    componentDidMount(){
        this._loadInitialState().done();
        this.updateGeolocation();
        let timer = setInterval(this.updateGeolocation, this.geolocationUpdatePeriod);
        this.setState({timer});
        this.game.listenForRegionChange(this.updateNodes);

        console.log("gameID: " + this.state.gameID);
        console.log("userID: " + this.state.userID);
    }

    calcTimeLeft = (startTime) => {
        let startDate = new Date(startTime);
        let timeElapsed = (Date.now() - startDate)/1000;
        let timeLeft = 600 - timeElapsed;
        console.log("TIME LEFT: " + timeLeft)
        return timeLeft
    }

    _loadInitialState = async () => {
        //console.log('loadinitialstate');
        //get id
        let value = await AsyncStorage.getItem('_id');
        //return to menu on error
        if (value == null){
            alert('error getting user ID');
            this.props.navigation.pop(1);
        }
        this.state.userID = value;
        console.log("userID: " + this.state.userID);

        //get gameInstance
        if(this.state.gameID === '' || this.state.gameID === null || this.state.gameID === undefined){
            alert('error getting game ID');
            this.props.navigation.pop(1);
        }

        this.game.getGame(this.state.gameID)
            .then((response) => {
                this.updateNodes(this.game.regions);
                this.setState({timeLeft: this.calcTimeLeft(response.startTime)});
                this.state.initialGetGame = true;
            })

        this.state.initialStateSet = true;
    };

  /**
   * Get the current latitude and longitude of self
   * -> update game doc with new geolocation of self
   * --> update map markers (this.state.playerMarkers) with all coordinates
   * --> update nodes
   *
   * @returns {Promise<void>}
   */
  updateGeolocation = () => {
        try {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    if (!this.state.regionSet) {
                        let region = {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            latitudeDelta: 0.01,
                            longitudeDelta: 0.0011
                        };
                        this.setState({region, regionSet: true})
                    }

                    //update geolocation on server
                    this.game.setGeolocation(this.state.userID, position.coords.longitude, position.coords.latitude)
                        .then((response) => {
                            //console.log(response);
                            this.setState({numErrors: 0});
                            this.checkWinner(response.winner);
                            //this.updateNodes(response.regions);
                            this.updatePlayers(position, response);
                        })
                        .catch((err) => {
                            console.error(err);
                            //TODO
                            //figure out what the specific way to check for "TypeError: Network request failed" is
                            let numErrors = this.state.numErrors + 1;
                            this.setState({numErrors: numErrors});
                            if (numErrors > 5) {
                                alert(err);
                            }
                        });
                },
                (err) => {
                    console.log(err)
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                }
            );
        }
        catch (error){
            console.log(error);
        }
    };

    /**
     *
     * @param position - position provided by navigator.watchPosition , contains
     *    info on lon and lat of self
     * @param response - game document return from server, contains enemy coordinates
     */
    updatePlayers = (position, response) => {
        try {
            if (!this.game.hasOwnProperty('geolocations') || !response) {
                throw new Error(`invalid http response or Game object. game = \n${this.game.toString()}`);
            }

            let coordEnemy = {
                latitude: 0,
                longitude: 0,
            };

            for (let userId in response.geolocations) {
                if (response.geolocations.hasOwnProperty(userId) && userId !== this.state.userID) {
                    coordEnemy.latitude = response.geolocations[userId].lat;
                    coordEnemy.longitude = response.geolocations[userId].lon;
                }
            }

            let playerMarkers = [
                {
                    coordinate: {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                    },
                    title: "User",
                    pinColor: '#0000ff',
                },
                {
                    coordinate: coordEnemy,
                    title: "Enemy",
                    pinColor: '#ff0000',
                },
            ]
            this.setState({
                playerMarkers: playerMarkers
            });

            //update players score
            for (let userId in response.scores) {
                if (userId !== 'null' && userId !== this.state.userID) {
                    this.setState({enemyScore: response.scores[userId]})
                }
                if (userId !== 'null' && userId === this.state.userID ){
                    this.setState({score: response.scores[userId]})
                }
            }
        }
        catch (error){
            console.error(error)
        }
    };

    /**
     * ->update nodes with response from server
     * @param regions - regions from game document return from server, contains regions which have LatLang, radius, owner, and type
     */
    updateNodes = (regions) => {
        let nodes=[];
        //console.log("updateNodes: " + JSON.stringify(regions));
        console.log(this.game.regions)
        for(let item in regions){
            //console.log("node: " + JSON.stringify(item));
            let coord = {
                latitude: regions[item].lat,
                longitude: regions[item].lon,
            };
            let color;
            if(regions[item].owner == null){
                color = '#FAF0E6';
            }
            else if (regions[item].owner === this.state.userID){
                color = '#0000ff';
            }
            else {
                color = '#ff0000';
            }

            let image;
            if(color === '#0000ff'){
                if(regions[item].type == "fort"){
                    image = blueFortImg;
                }
                else if (regions[item].type == "castle"){
                    image = blueCastleImg;
                }
            }
            else if (color === '#ff0000'){
                if (regions[item].type == "fort") {
                    image = redFortImg;
                }
                else if (regions[item].type == "castle") {
                    image = redCastleImg;
                }
            }
            else {
                if (regions[item].type == "fort") {
                    image = fortImg;
                }
                else if (regions[item].type == "castle") {
                    image = castleImg;
                }
            }

            let node = {
                coordinate: coord,
                color: color,
                title: regions[item].type,
                radius: regions[item].radius,
                image: image,
            };
            nodes.push(node);
        }
        //console.log("nodes: " + JSON.stringify(nodes));
        this.setState({nodes: nodes});
    };

    /**
     * ->checks if the game document has returned a winner and the game should be over
     * @param winner - values of null, userID, or the enemys ID
     */
    checkWinner = (winner) => {
        if(winner != null)
        {
            if(winner === this.state.userID){
                this.endGame(true)
            }
            else {
                this.endGame(false)
            }
        }
    }

    render(){
        if(this.state.regionSet && this.state.initialStateSet && this.state.initialGetGame) {
            return (
                <View style={styles.wrapper}>
                    <View style={styles.container}>
                        <MapView style={styles.map}
                                 initialRegion={this.state.region}
                                 onRegionChangeComplete={(region) => this.onRegionChange(region)}
                                 key={"gs-map-view"}
                                 showsCompass={false}
                        >
                            {this.state.playerMarkers.map(marker => (
                                <Marker
                                    key={marker.title}
                                    coordinate={marker.coordinate}
                                    title={marker.title}
                                    pinColor={marker.pinColor}
                                />
                            ))}
                            {this.state.nodes.map(marker => (
                                <Marker
                                    coordinate={marker.coordinate}
                                    title={marker.title}
                                    image={marker.image}
                                />
                            ))}
                            {this.state.nodes.map(marker => (
                                <Circle
                                    center={marker.coordinate}
                                    radius={marker.radius}
                                    fillColor={marker.color}
                                />
                            ))}

                        </MapView>
                        <TouchableOpacity
                            style={styles.btn}
                            onPress={this.quitGame}
                        >
                            <Text>Click Here to Quit</Text>
                        </TouchableOpacity>
                        <View style = {styles.scoreDisplay}>
                            <Text >
                                Score: {this.state.score} {"   "}
                                Enemy: {this.state.enemyScore}
                            </Text>
                        </View>
                        <View style={{flexDirection: 'row', justifyContent: 'center'}}>
                            <CountDown
                                until={this.state.timeLeft}
                                size={15}
                                timeToShow={['M', 'S']}
                            />

                        </View>

                    </View>

                </View>
            );
        }
        else {
            return(
                <View style={{flex: 1, justifyContent: 'center', alignItems: "center",}}>
                    <Text>Loading</Text>
                </View>
            );
        }
    }

    /**
     * ->update MapView region
     * @param region
     */
    onRegionChange(region) {
        if(!this.state.regionSet) return;
        this.setState({ region });
    }

    /**
     * -> function called when user presses the Quit game button
     */
    quitGame = () => {
        clearInterval(this.state.timer);
        this.game.leave(this.state.userID, this.state.gameID);
        AsyncStorage.removeItem('gameID');
        this.props.navigation.pop(2);
    }

    /**
     * -> function called when a winner has been set in the game document
     * @param isWinner - true or false value that will be passed to the GameOver screen
     */
    endGame = (isWinner) => {
        console.log("isWinner in endGame: " + isWinner );
        //alert('ending game');
        clearInterval(this.state.timer);
        this.game.leave(this.state.userID, this.state.gameID);
        AsyncStorage.removeItem('gameID');
        this.props.navigation.navigate('GameOver', {isWinner: isWinner});
    }

}

const styles = StyleSheet.create({
    wrapper: { flex: 1},
    head: { height: 40, backgroundColor: '#f1f8ff' },
    text: { margin: 6 },
    menuContainer: {
        flex: 0.2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2896d3',
        paddingLeft: 40,
        paddingRight: 40,
    },
    btn: {
        alignSelf: 'stretch',
        backgroundColor: '#FAB913',
        padding: 5,
        alignItems: 'center',
        marginBottom: 10,
        marginTop: 10,
    },
    container: {
        flex: 1,
        padding: 16,
        paddingTop: 30,
        backgroundColor: '#fff'
    },
    map: {
        ...StyleSheet.absoluteFillObject,
    },
    scoreDisplay: {
        alignSelf: 'stretch',
        backgroundColor: '#FAB913',
        padding: 5,
        alignItems: 'center',
        marginBottom: 10,
        marginTop: 0,
    },
});
