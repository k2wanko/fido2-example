package dev.k2wanko.examples.fido2.extension

import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.HttpsCallableResult
import dev.k2wanko.examples.fido2.model.RegisterRequestResponse
import dev.k2wanko.examples.fido2.model.RegisterResponseResponse
import dev.k2wanko.examples.fido2.model.SignInRequestResponse
import dev.k2wanko.examples.fido2.model.SignInResponseResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlin.reflect.KClass
import kotlin.reflect.KMutableProperty
import kotlin.reflect.KVisibility
import kotlin.reflect.full.memberProperties

suspend fun FirebaseFunctions.registerRequest() = withContext(Dispatchers.Default) {
     return@withContext this@registerRequest
        .getHttpsCallable("registerRequest")
        .call()
        .await()
        .from(RegisterRequestResponse::class)
}

suspend fun FirebaseFunctions.registerResponse(data: Any) = withContext(Dispatchers.Default) {
    return@withContext this@registerResponse
        .getHttpsCallable("registerResponse")
        .call(data)
        .await()
        .from(RegisterResponseResponse::class)
}

suspend fun FirebaseFunctions.signInRequest() = withContext(Dispatchers.Default) {
    return@withContext this@signInRequest
        .getHttpsCallable("signInRequest")
        .call()
        .await()
        .from(SignInRequestResponse::class)
}

suspend fun FirebaseFunctions.signInResponse(data: Any) = withContext(Dispatchers.Default) {
    return@withContext this@signInResponse
        .getHttpsCallable("signInResponse")
        .call(data)
        .await()
        .from(SignInResponseResponse::class)
}

fun <T: Any> HttpsCallableResult.from(type: KClass<T>): T? {
    val data = this.data
    if (data !is HashMap<*, *>) {
        return null
    }

    val res = type.java.newInstance()
    type.memberProperties
        .filter { it.visibility == KVisibility.PUBLIC }
        .filterIsInstance<KMutableProperty<*>>()
        .forEach {
            val v = data[it.name] ?: return@forEach
            it.setter.call(res, v)
            return@forEach
        }

    return res
}