package dev.k2wanko.examples.fido2

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.widget.Button
import android.widget.RadioButton
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.android.gms.fido.Fido
import com.google.android.gms.fido.common.Transport
import com.google.android.gms.fido.fido2.Fido2ApiClient
import com.google.android.gms.fido.fido2.api.common.*
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.functions.FirebaseFunctions
import dev.k2wanko.examples.fido2.extension.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class MainActivity : AppCompatActivity() {
    private val REQUEST_FIDO2_REGISTER = 0xf1d0
    private val REQUEST_FIDO2_SIGNIN = 0xf1d0 + 1

    private lateinit var fidoClient: Fido2ApiClient
    private lateinit var auth: FirebaseAuth
    private lateinit var functions: FirebaseFunctions

    private var authenticationSelection = Attachment.PLATFORM

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        fidoClient = Fido.getFido2ApiClient(this)
        fidoClient.isUserVerifyingPlatformAuthenticatorAvailable.addOnSuccessListener {
            Log.d("@@@", "FIDO isUserVerifyingPlatformAuthenticatorAvailable = $it")
        }


        auth = FirebaseAuth.getInstance()
        functions = FirebaseFunctions.getInstance()

//        functions.useFunctionsEmulator("http://localhost:5001")

        val registerButton = findViewById<Button>(R.id.register)
        val signInButton = findViewById<Button>(R.id.sign_in)
        val signOutButton = findViewById<Button>(R.id.sign_out)
        val uidText = findViewById<TextView>(R.id.uid)

        val selection = savedInstanceState?.getString("authenticationSelection",  "platform") ?: "platform"

        val platformButton = findViewById<RadioButton>(R.id.platformButton)
        val crossPlatformButton = findViewById<RadioButton>(R.id.crossPlatformButton)

        if (selection === "platform") {
            platformButton.isChecked = true
            crossPlatformButton.isChecked = false
            authenticationSelection = Attachment.PLATFORM
        } else {
            platformButton.isChecked = false
            crossPlatformButton.isChecked = true
            authenticationSelection = Attachment.CROSS_PLATFORM
        }

        platformButton.setOnCheckedChangeListener { _, b ->
            if (b) {
                authenticationSelection = Attachment.PLATFORM
            }
        }

        crossPlatformButton.setOnCheckedChangeListener { _, b ->
            if (b) {
                authenticationSelection = Attachment.CROSS_PLATFORM
            }
        }

        auth.addAuthStateListener {
            val user = it.currentUser
            if (user == null) {
                uidText.text = ""
                return@addAuthStateListener
            }

            uidText.text = user.uid
        }

        registerButton.setOnClickListener {
            registerRequest()
        }

        signInButton.setOnClickListener {
            signInRequest()
        }

        signOutButton.setOnClickListener {
            auth.signOut()
        }
    }

    private fun registerRequest() = GlobalScope.launch(Dispatchers.Main) {
        val res = functions.registerRequest()?: return@launch

        val publicKeyCredentialCreationOptions = PublicKeyCredentialCreationOptions.Builder().apply {
            setRp(PublicKeyCredentialRpEntity("k2webauthn.web.app", "FIDO2 Demo", null))
            setParameters(
                ArrayList<PublicKeyCredentialParameters>(
                    listOf(
                        PublicKeyCredentialParameters(
                            PublicKeyCredentialType.PUBLIC_KEY.toString(),
                            RSAAlgorithm.RS256.algoValue
                        )
                    )
                )
            )
            setUser(
                PublicKeyCredentialUserEntity(
                    "".toByteArray(),
                    "",   // Name
                    null, // Icon
                    ""    // Display Name
                )
            )

            setAuthenticatorSelection(AuthenticatorSelectionCriteria.Builder().apply {
                setAttachment(authenticationSelection)
            }.build())

            setAttestationConveyancePreference(AttestationConveyancePreference.DIRECT)

            // Set challenge
            setChallenge(res.challenge.decodeBase64())
        }.build()

        val task = fidoClient.getRegisterPendingIntent(publicKeyCredentialCreationOptions)
        try {
            val intent = task.await()

            startIntentSenderForResult(intent.intentSender,
                REQUEST_FIDO2_REGISTER,
                null,
                0,
                0,
                0,
                null)
        } catch (err: Exception) {
            Log.e("@@@", "catch", err)
        }
        if (task.isComplete && !task.isSuccessful) {
            Log.e("@@@", "getRegisterIntent", task.exception)
            return@launch
        }
        Log.d("@@@", "requestRegister end ${task.isComplete} ${task.isSuccessful}")
    }

    private fun handleRegisterResponse(data: Intent) = GlobalScope.launch(Dispatchers.Main) {
        val response = AuthenticatorAttestationResponse.deserializeFromBytes(
            data.getByteArrayExtra(Fido.FIDO2_KEY_RESPONSE_EXTRA)!!
        )

        val rawId = response.keyHandle.toBase64()
        val clientDataJSON = response.clientDataJSON.toBase64()
        val credentialId = response.keyHandle.toBase64()
        val attestationObject = response?.attestationObject?.toBase64() ?: return@launch

        val data = hashMapOf(
            "rawId" to rawId,
            "credentialId" to credentialId,
            "clientDataJSON" to clientDataJSON,
            "attestationObject" to attestationObject,
            "apkSigSha256" to getApkSigSha256()
        )

        val res = functions.registerResponse(data)
        auth.signInWithCustomToken(res!!.token).await()
        Log.d("@@@", "DONE register")
    }

    private fun signInRequest() = GlobalScope.launch(Dispatchers.Main) {
        val res = functions.signInRequest()?: return@launch
        val publicKeyCredentialRequestOptions = PublicKeyCredentialRequestOptions.Builder().apply {
            setRpId("k2webauthn.web.app")
            setAllowList(res.allowCredentials.map {
                PublicKeyCredentialDescriptor(PublicKeyCredentialType.PUBLIC_KEY.toString(), it["credId"].toString().decodeBase64(), (it["transports"] as List<*>).map { transport ->
                    Log.d("@@@", "transport = $transport")
                    when(transport) {
                        Transport.USB.toString() -> Transport.USB
                        else -> Transport.INTERNAL
                    }
                })
            })

            // Set challenge
            setChallenge(res.challenge.decodeBase64())
        }.build()

        val task = fidoClient.getSignPendingIntent(publicKeyCredentialRequestOptions)
        try {
            val intent = task.await()

            startIntentSenderForResult(intent.intentSender,
                REQUEST_FIDO2_SIGNIN,
                null,
                0,
                0,
                0,
                null)
        } catch (err: Exception) {
            Log.e("@@@", "catch", err)
        }
        if (task.isComplete && !task.isSuccessful) {
            Log.e("@@@", "getRegisterIntent", task.exception)
            return@launch
        }
    }

    private fun handleSignInResponse(data: Intent) = GlobalScope.launch(Dispatchers.Main) {
        val response = AuthenticatorAssertionResponse.deserializeFromBytes(
            data.getByteArrayExtra(Fido.FIDO2_KEY_RESPONSE_EXTRA)
        )
        val rawId = response.keyHandle.toBase64()

        val res = functions.signInResponse(hashMapOf(
            "type" to PublicKeyCredentialType.PUBLIC_KEY.toString(),
            "rawId" to rawId,
            "clientDataJSON" to response.clientDataJSON.toBase64(),
            "authenticatorData" to response.authenticatorData.toBase64(),
            "signature" to response.signature.toBase64(),
            "userHandle" to response.userHandle?.toBase64(),
            "apkSigSha256" to getApkSigSha256()
        ))
        auth.signInWithCustomToken(res!!.token).await()
        Log.d("@@@", "DONE signIn")
    }

    override fun onSaveInstanceState(outState: Bundle) {
        val selection = if (authenticationSelection == Attachment.PLATFORM) {
            "platform"
        } else {
            "cross-platform"
        }
        Log.d("@@@", "onSaveInstanceState authenticationSelection $selection")
        outState.putString("authenticationSelection", selection)
        super.onSaveInstanceState(outState)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        when(requestCode) {
            REQUEST_FIDO2_REGISTER -> {
                val errorExtra = data?.getByteArrayExtra(Fido.FIDO2_KEY_ERROR_EXTRA)
                when {
                    errorExtra != null -> {
                        val error = AuthenticatorErrorResponse.deserializeFromBytes(errorExtra)
                        error.errorMessage?.let { errorMessage ->
                            Toast.makeText(this, errorMessage, Toast.LENGTH_LONG).show()
                            Log.e("@@@", errorMessage)
                        }
                    }
                    resultCode != RESULT_OK -> {
                        Toast.makeText(this, R.string.cancelled, Toast.LENGTH_SHORT).show()
                    }
                    else -> {
                        data?.let {
                            handleRegisterResponse(it)
                        }
                    }
                }
            }
            REQUEST_FIDO2_SIGNIN -> {
                val errorExtra = data?.getByteArrayExtra(Fido.FIDO2_KEY_ERROR_EXTRA)
                when {
                    errorExtra != null -> {
                        val error = AuthenticatorErrorResponse.deserializeFromBytes(errorExtra)
                        error.errorMessage?.let { errorMessage ->
                            Toast.makeText(this, errorMessage, Toast.LENGTH_LONG).show()
                            Log.e("@@@", errorMessage)
                        }
                    }
                    resultCode != RESULT_OK -> {
                        Toast.makeText(this, R.string.cancelled, Toast.LENGTH_SHORT).show()
                    }
                    else -> {
                        data?.let {
                            handleSignInResponse(it)
                        }
                    }
                }
            }
            else -> super.onActivityResult(requestCode, resultCode, data)
        }
    }

}
