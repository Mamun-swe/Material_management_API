

const Upload = data => {
    let error = {}

    if (!data) error.message = "supplementary file is required"
    if (data && data.supplementary_file[0]) {
        const match = [
            "image/png",
            "image/jpeg",
            "application/pdf"
        ].find(item => item === data.supplementary_file[0].mimetype)

        if (data.supplementary_file[0].mimetype && !match) {
            error.message = data.supplementary_file[0].mimetype + " isn't support"
        }
    }


    return {
        error,
        isValid: Object.keys(error).length === 0
    }
}

module.exports = {
    Upload
}