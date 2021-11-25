
const { isEmail } = require("./helpers.validator")

const Login = data => {
    let error = {}

    if (!data.email) error.email = "Email is required"
    if (data.email) {
        if (!isEmail(data.email)) error.email = "Address isn't valid"
    }

    if (!data.password) error.password = "Password is required"

    return {
        error,
        isValid: Object.keys(error).length === 0
    }
}

module.exports = {
    Login
}