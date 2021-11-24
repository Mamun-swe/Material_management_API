/**
 * Identify matches between two strings
 *
 * @param {string} sourceString
 * @param {string} targetString
 * @param {boolean} returnMatches
 *
 * @returns {string|boolean}
 */
exports.matchesBetweenStrings = ( sourceString, targetString, returnMatches = false ) => {

    let matched = false
        , sourceValues = sourceString.split(',')
        , targetValues = targetString.split(',')
        , matches = '';

    for ( let s = 0; s < sourceValues.length; s ++ ) {
        sourceValues[s] = sourceValues[s].trim();
    }

    for ( let t = 0; t < targetValues.length; t ++ ) {
        targetValues[t] = targetValues[t].trim();
    }

    for ( let i = 0; i < sourceValues.length; i ++ ) {

        if ( targetValues.includes(sourceValues[i]) ) {

            matched = true;

            if ( returnMatches )
                matches = ( matches === '' ) ? sourceValues[i] : matches + ', ' + sourceValues[i];

        } //end if

    } //end for

    if ( returnMatches )
        return matches;
    else
        return matched;

} // end matchesBetweenStrings

/**
 * Get dates between a given date-range
 *
 * @param {string} startDate
 * @param {string} endDate
 *
 * @returns {[]}
 */
exports.getDatesBetweenDates = (startDate, endDate) => {

    let dates = [];

    //to avoid modifying the original date
    const fromDate = new Date(startDate)
        , toDate = new Date(endDate);

    while (fromDate <= toDate) {
        dates = [...dates, new Date(fromDate)];
        fromDate.setDate(fromDate.getDate() + 1);
    }

    return dates;

} // end getDatesBetweenDates

/**
 * Get the list of overlapping dates between two sets of date-ranges
 *
 * @param {[]} sourceDates
 * @param {[]} targetDates
 *
 * @returns {[]}
 */
exports.getOverlappingDates = (sourceDates, targetDates) => {

    let overlappingDates = [];

    for ( let s = 0; s < sourceDates.length; s ++ ) {

        for ( let t = 0; t < targetDates.length; t ++ ) {

            let targetDate = new Date(targetDates[t])
                , sourceDate = new Date(sourceDates[s]);

            if ( targetDate.getTime() === sourceDate.getTime() )
                overlappingDates = [...overlappingDates, sourceDates[s]];
        }

    } //end for

    return overlappingDates;

} // end getOverlappingDates

/**
 * Check whether own request and other request match with material type & quality
 *
 * @param {number} matchableRequestType
 * @param {object} ownRequest
 * @param {object} suggestingRequest
 *
 * @returns {object}
 */
exports.isMaterialMatched = (matchableRequestType, ownRequest, suggestingRequest) => {

    let materialMatched = false
        , matchedMaterialTypes = ''
        , matchedMaterialQuality = '';

    if ( suggestingRequest.request_type === 'Disposal' || suggestingRequest.request_type === 'Backfill' ) {
        if ( suggestingRequest.request_type === 'Disposal' )
            suggestingRequest.request_type = 1;
        else
            suggestingRequest.request_type = 2;
    }

    if ( suggestingRequest.filling_purpose === 'Permanent' || suggestingRequest.filling_purpose === 'Temporary' ) {
        if ( suggestingRequest.filling_purpose === 'Permanent' )
            suggestingRequest.filling_purpose = 1;
        else
            suggestingRequest.filling_purpose = 2;
    }

    /*console.log('SUGGESTING REQUEST:');
    console.log(suggestingRequest);
    console.log('OWN REQUEST:');
    console.log(ownRequest);*/


    if ( suggestingRequest.request_type === matchableRequestType ) {

        if ( suggestingRequest.filling_purpose === 1 ) { //Permanent

            if ( ownRequest.material_type === suggestingRequest.material_type ) {

                materialMatched = true;
                matchedMaterialTypes = suggestingRequest.material_type;
            }

            if (
                ownRequest.hasOwnProperty('material_quality') &&
                suggestingRequest.hasOwnProperty('material_quality') &&
                ( ownRequest.material_type === suggestingRequest.material_type ) &&
                ( (ownRequest.material_type !== 'Broken Concrete') && (ownRequest.material_quality === suggestingRequest.material_quality) )
            ) {

                materialMatched = true;
                matchedMaterialTypes = suggestingRequest.material_type;
                matchedMaterialQuality = suggestingRequest.material_quality;
            }

        } else { //Temporary

            materialMatched = this.matchesBetweenStrings(
                ownRequest.material_type,
                suggestingRequest.material_type
            );

            if ( materialMatched ) {

                matchedMaterialTypes = this.matchesBetweenStrings(
                    ownRequest.material_type,
                    suggestingRequest.material_type,
                    true
                );
            }

            if (
                ownRequest.hasOwnProperty('material_quality') &&
                suggestingRequest.hasOwnProperty('material_quality') &&
                ( ownRequest.material_type === suggestingRequest.material_type ) &&
                ( (ownRequest.material_type !== 'Broken Concrete') && (ownRequest.material_quality === suggestingRequest.material_quality) )
            ) {

                materialMatched = true;
                matchedMaterialTypes = suggestingRequest.material_type;
                matchedMaterialQuality = suggestingRequest.material_quality;
            }
        } //end else

    } //end if

    return {
        "material_matched": materialMatched,
        "matched_material_types": matchedMaterialTypes,
        "matched_material_quality": matchedMaterialQuality
    };

} //end isMaterialMatched

/**
 * Get the location score by a given kilometer-distance
 *
 * @param {float} distance
 * @returns {number}
 */
exports.getLocationScoreByDistanceInKm = (distance) => {

    let locationScore = 0.00
        , distanceInKm = parseFloat(distance);

    if ( distanceInKm <= 5 )
        locationScore = 1;
    else if ( distanceInKm <= 10 )
        locationScore = 0.9;
    else if ( distanceInKm <= 15 )
        locationScore = 0.8;
    else if ( distanceInKm <= 20 )
        locationScore = 0.7;
    else if ( distanceInKm <= 25 )
        locationScore = 0.6;
    else if ( distanceInKm <= 30 )
        locationScore = 0.5;
    else if ( distanceInKm <= 35 )
        locationScore = 0.4;
    else if ( distanceInKm <= 40 )
        locationScore = 0.3;
    else if ( distanceInKm <= 45 )
        locationScore = 0.2;
    else
        locationScore = 0.1;

    return locationScore;

} //end getLocationScoreByDistanceInKm

/**
 * Check Whether a Given Request Can Match The Target Request
 *
 * @param {array} ownRequests
 * @param {object} suggestingRequest
 * @returns {object}
 */
exports.isRematched = (ownRequests, suggestingRequest) => {

    let score = {
        "filling_purpose_score": 0.00,
        "schedule_score": 0.00,
        "overlapping_start_date": '0000-00-00',
        "overlapping_end_date": '0000-00-00',
        "material_volume_score": 0.00
    };

    for ( let i = 0; i < ownRequests.length; i++ ) {

        Object.assign(ownRequests[i], score);

        //Filling Purpose
        ownRequests[i].filling_purpose_score = ( ownRequests[i].filling_purpose === suggestingRequest.filling_purpose ) ? 1 : 0.5;

        //Schedule
        let ownDates = this.getDatesBetweenDates( ownRequests[i].schedule_start_date, ownRequests[i].schedule_end_date )
            , otherDates = this.getDatesBetweenDates( suggestingRequest.schedule_start_date, suggestingRequest.schedule_end_date )
            , overlappingDates = this.getOverlappingDates(ownDates, otherDates)
            , numOfOverlapping = overlappingDates.length;

        if ( numOfOverlapping > 0 ) {

            ownRequests[i].schedule_score = ( numOfOverlapping / ownDates.length ).toFixed(2);
            ownRequests[i].overlapping_start_date = overlappingDates[0];
            ownRequests[i].overlapping_end_date = overlappingDates[numOfOverlapping-1];
        }

        //Material Volume
        if ( ownRequests[i].schedule_score > 0 ) {

            let matchableRequestType;

            if ( ownRequests[i].request_type === 'Disposal' || ownRequests[i].request_type === 'Backfill' )
                matchableRequestType = ( ownRequests[i].request_type === 'Disposal' ) ? 2 : 1
            else
                matchableRequestType = ( ownRequests[i].request_type === 1 ) ? 2 : 1

            let materialMatchingDetails = this.isMaterialMatched(matchableRequestType, ownRequests[i], suggestingRequest);

            //console.log(materialMatchingDetails);

            if ( materialMatchingDetails.material_matched ) {

                ownRequests[i].material_volume_score = ( suggestingRequest.available_volume > ownRequests[i].available_volume  ) ? 1 :
                    ( suggestingRequest.available_volume / ownRequests[i].available_volume ).toFixed(2);

                ownRequests[i].material_type = materialMatchingDetails.matched_material_types;
                ownRequests[i].material_quality = materialMatchingDetails.matched_material_quality;
            }
        } //end if

    } //end main for

    return ownRequests;

} //end isRematched
