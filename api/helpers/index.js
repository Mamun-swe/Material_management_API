const slugify = require("slugify")

// Custom slug generator
const CustomSlug = (data) => {
    let newSlug = slugify(data, {
        replacement: '-',  // replace spaces with replacement character, defaults to `-`
        remove: /[`/|*+~.()'"!:@]/g, // remove characters that match regex, defaults to `undefined`
        lower: true,      // convert to lower case, defaults to `false`
        strict: false,     // strip special characters except replacement, defaults to `false`
        locale: 'vi'       // language code of the locale to use
    })
    newSlug = newSlug + '-' + Date.now()
    return newSlug
}

// Unique file name generate
const FileNameGenerator = (data) => {
    let name
    if (data) {
        const originalName = data.split('.')[0]
        name = CustomSlug(originalName) + "." + data.split('.')[1]
    }

    return name
}


module.exports = {
    CustomSlug,
    FileNameGenerator
}