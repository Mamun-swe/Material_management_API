
const ConfirmMatch = data => {
    let error = {}

    if (!data.user_id) error.user_id = "user id is required"
    if (!data.own_request_id) error.own_request_id = "own request id is required"
    if (!data.matched_requests) error.matched_requests = "matched requests is required"

    return {
        error,
        isValid: Object.keys(error).length === 0
    }
}

module.exports = {
    ConfirmMatch
}