const fs = require("fs");

const base64 = `
kpuo6KGCNFFVAfUtrMp8RWrE4KuTdKp7AQeLQztP60APXEqsXXKvrJ25oic5HoZ652+DvmFJSLJa
YrAIbGsnUk1hDFBBaXGOzCKTqxFsWHdbNMhlrrurXe617+CGHS6lkJ2EZ3x9Hug73DMCuvezTl2p
FK/IQvKytLBKc0N7pVTx/MJooBiJRMRK3N7QU1/kZxazZI8sNC2cQUnAZPUEdFbwW1J8yZ5tQQZl
yW3S6zqqAzTU7ToQd97t5KO0T6RGzp7dZXhnqFBgMqSXz9bU8Q3JBRXxAoO2CJFCs+qXDggkqn3G
e+Fh3jH+8Q7Ah55KNR9rYIO62gP8eTgyvebYGVxNCFJGDwTp+OFI+AakamvzDwT7TKMu9zwWH79I
BnJqAcmo2M7RH1MvFd84rddE1GdWV0Aiz1jQCsKnJI3CAQvyl3MoRnRySWV6YEzUL2QfQzCAtvN4
7awX0KIipmjpMnTJQoasnbJxr+DWupLCQaJjvaFBw6VfepRkyia7z+Nhg6nogqCsxXUb8wHMiYKN
oOFegTpXcbnvgJFXVMRYAgWnxUcqBjM8jHgB61yKsIxG
`.replace(/\s+/g, "");

const buffer = Buffer.from(base64, "base64");
fs.writeFileSync("output.bin", buffer);

console.log("Decoded bytes:", buffer.length);