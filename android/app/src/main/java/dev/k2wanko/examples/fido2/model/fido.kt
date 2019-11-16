package dev.k2wanko.examples.fido2.model

data class RegisterRequestResponse(
    var challenge: String = ""
)

data class SignInRequestResponse(
    var challenge: String = "",
    var allowCredentials: List<HashMap<*, *>> = arrayListOf()
)

data class Credential(
    var credId: String = "",
    var publicKey: String = "",
    var aaguid: String = "",
    var prevCounter: Int = 0
)

data class RegisterResponseResponse(
    var token: String = "",
    var credentialId: String = ""
)

data class SignInResponseResponse(
    var token: String = "",
    var credentialId: String = ""
)