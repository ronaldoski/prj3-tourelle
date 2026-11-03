import React from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { useState } from 'react'
import { useRouter } from 'expo-router'

const Index = () => {
    const [mdp, setMdp] = useState('')
    const [error, setError] = useState('')
    const router = useRouter()

    const handleSubmit = () => {
        if (mdp === '1478') {
            setError('')
            router.push('/HomeP')
        } else {
            setError('Please try again')
            setMdp('')
        }
    }

    return (

        <View style={styles.container}>
          {/*helha logo*/}
          <Text>Missile.io</Text>
            <Text style={styles.title}>Enter the password</Text>
            <TextInput
                style={styles.input}
                value={mdp}
                onChangeText={(text) => {
                    setMdp(text)
                    setError('')
                }}
                placeholder="Password"
                secureTextEntry
                keyboardType="numeric"
            />
            {error ? (
                <Text style={styles.error}>{error}</Text>
            ) : null}
            <TouchableOpacity style={styles.button} onPress={handleSubmit}>
                <Text style={styles.buttonText}>Validate</Text>
            </TouchableOpacity>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        padding: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 30,
        color: '#333',
    },
    input: {
        width: '100%',
        height: 50,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        paddingHorizontal: 15,
        fontSize: 16,
        backgroundColor: '#fff',
        marginBottom: 20,
    },
    button: {
        width: '100%',
        height: 50,
        backgroundColor: '#1e88e5',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    error: {
        color: '#f90505ff',
        fontSize: 16,
        marginBottom: 10,
        textAlign: 'center',
    },
})

export default Index