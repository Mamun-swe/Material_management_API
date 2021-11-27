

const Login = data => {
    let error = {}

    if (!data.uid) error.uid = "uid is required"
    if (!data.pwd) error.pwd = "Password is required"

    return {
        error,
        isValid: Object.keys(error).length === 0
    }
}

module.exports = {
    Login
}